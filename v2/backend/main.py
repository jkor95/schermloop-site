"""SchermLoop 2.0: gescheiden bedrijfsomgevingen met schermlicenties.

Deze versie is een afzonderlijke test-/pilotimplementatie. Er wordt nooit
verbinding gemaakt met de bestaande SchermLoop Github-tokenopslag.
"""
import io
import json
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from argon2.exceptions import VerifyMismatchError, VerificationError
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from starlette.staticfiles import StaticFiles

from .auth import (DEVICE_COOKIE, PH, SECURE_COOKIES, SESSION_COOKIE,
                   current_user, ensure_admin, ensure_org, later, now,
                   random_token, require_csrf, set_cookie, sha)
from .database import connection, init_db

BASE = Path(__file__).resolve().parents[1]
STATIC = BASE / "frontend"
UPLOAD = Path(os.environ.get("SCHERMLOOP_UPLOAD_DIR", "/data/uploads"))
MAX_UPLOAD = 50 * 1024 * 1024
DEFAULT_SETTINGS = {
    "show_clock": True, "show_weather": False, "show_news": False,
    "news_mode": "ticker", "weather_location": "Dordrecht",
    "background": "#0b1624", "background_mode": "black",
}
DEFAULT_SCHEDULE = {"enabled": False, "timezone": "Europe/Amsterdam", "days": [0, 1, 2, 3, 4], "on": "07:30", "off": "18:00", "cec_enabled": False}
app = FastAPI(title="SchermLoop 2.0", docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


def json_value(row, field, fallback):
    try:
        result = json.loads(row[field])
        return result if isinstance(result, dict) else fallback
    except (TypeError, ValueError, KeyError):
        return fallback


def org_settings(db, org_id):
    record = db.execute("SELECT settings_json FROM organization_settings WHERE org_id=?", (org_id,)).fetchone()
    return {**DEFAULT_SETTINGS, **(json_value(record, "settings_json", {}) if record else {})}


def audit(db, user, action, org_id=None, details=None):
    db.execute("INSERT INTO audit_log(org_id, actor_id, action, details, created_at) VALUES(?,?,?,?,?)",
               (org_id, user["id"] if user else None, action, json.dumps(details or {}), now()))


def initialize():
    init_db()
    UPLOAD.mkdir(parents=True, exist_ok=True)
    email = os.environ.get("SCHERMLOOP_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("SCHERMLOOP_ADMIN_PASSWORD", "")
    with connection() as db:
        owner = db.execute("SELECT id FROM users WHERE role='superadmin'").fetchone()
        if not owner:
            if not email or len(password) < 16 or password.startswith("VUL_"):
                raise RuntimeError("Stel SCHERMLOOP_ADMIN_EMAIL en een uniek SCHERMLOOP_ADMIN_PASSWORD (minimaal 16 tekens) in bij Coolify. Starten zonder eigenaar is niet veilig.")
            db.execute("""INSERT INTO users(id,org_id,email,display_name,password_hash,role,active,must_change_password,created_at)
                VALUES(?,NULL,?,?,?,'superadmin',1,0,?)""",
                (str(uuid.uuid4()), email, "JK Works Hoofdbeheer", PH.hash(password), now()))


@app.on_event("startup")
def startup():
    initialize()


@app.middleware("http")
async def secure_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = ("default-src 'self'; img-src 'self' data: blob:; "
        "style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; "
        "frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'self'")
    response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/") else "no-cache"
    return response


@app.get("/health")
def health():
    with connection() as db:
        db.execute("SELECT 1")
    return {"status": "ok", "service": "schermloop2"}


@app.get("/")
def main_page():
    return FileResponse(STATIC / "index.html", media_type="text/html")


@app.get("/player")
def player_page():
    return FileResponse(STATIC / "player.html", media_type="text/html")


@app.get("/sw.js")
def service_worker():
    response = FileResponse(STATIC / "sw.js", media_type="application/javascript")
    response.headers["Service-Worker-Allowed"] = "/"
    return response


class Login(BaseModel):
    email: str
    password: str


# Per-IP logins alleen in het geheugen; bij toekomstige schaalvergroting vervangen door Redis.
FAILURES = {}


@app.post("/api/auth/login")
def login(data: Login, request: Request):
    email = data.email.strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    key = (email, client_ip)
    elapsed = datetime.now(timezone.utc).timestamp()
    failures = [x for x in FAILURES.get(key, []) if x > elapsed - 600]
    if len(failures) >= 8:
        raise HTTPException(429, "Te veel pogingen. Probeer het over 10 minuten opnieuw")
    with connection() as db:
        user = db.execute("SELECT * FROM users WHERE email=? AND active=1", (email,)).fetchone()
        valid = False
        try:
            # Ook bij ontbrekende gebruikers wordt verificatiewerk gedaan.
            valid = PH.verify(user["password_hash"] if user else PH.hash("onbekende-gebruiker"), data.password)
        except (VerifyMismatchError, VerificationError):
            valid = False
        if not user or not valid:
            failures.append(elapsed)
            FAILURES[key] = failures
            raise HTTPException(401, "Onjuiste inloggegevens")
        if user["org_id"]:
            org = db.execute("SELECT active FROM organizations WHERE id=?", (user["org_id"],)).fetchone()
            if not org or not org["active"]:
                raise HTTPException(403, "Deze bedrijfsomgeving is niet actief")
        FAILURES.pop(key, None)
        raw, csrf = random_token(), random_token()
        db.execute("INSERT INTO sessions(token_hash,user_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)",
                   (sha(raw), user["id"], csrf, later(7*86400), now()))
        response = JSONResponse({"ok": True, "csrf": csrf})
        set_cookie(response, SESSION_COOKIE, raw, 7)
        return response


@app.get("/api/auth/me")
def me(request: Request):
    user = current_user(request)
    return {"id": user["id"], "email": user["email"], "name": user["display_name"], "role": user["role"],
            "org_id": user["org_id"], "csrf": user["csrf"], "must_change_password": bool(user["must_change_password"])}


@app.post("/api/auth/logout")
def logout(request: Request):
    user = current_user(request)
    require_csrf(request, user)
    with connection() as db:
        db.execute("DELETE FROM sessions WHERE token_hash=?", (sha(request.cookies[SESSION_COOKIE]),))
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


class ChangePassword(BaseModel):
    old_password: str
    new_password: str = Field(min_length=16, max_length=256)


@app.post("/api/auth/password")
def change_password(data: ChangePassword, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    try:
        valid = PH.verify(user["password_hash"], data.old_password)
    except (VerifyMismatchError, VerificationError):
        valid = False
    if not valid:
        raise HTTPException(400, "Het huidige wachtwoord is onjuist")
    with connection() as db:
        db.execute("UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?", (PH.hash(data.new_password), user["id"]))
        db.execute("DELETE FROM sessions WHERE user_id=? AND token_hash<>?", (user["id"], sha(request.cookies[SESSION_COOKIE])))
        audit(db, user, "password.changed", user["org_id"])
    return {"ok": True}


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,49}$")
    email: str = Field(min_length=6, max_length=180)
    display_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=16, max_length=256)


@app.get("/api/organizations")
def organizations(request: Request):
    user = current_user(request)
    with connection() as db:
        if user["role"] == "superadmin":
            rows = db.execute("""SELECT o.*,
                (SELECT COUNT(*) FROM users u WHERE u.org_id=o.id AND u.active=1) AS users_used,
                (SELECT COUNT(*) FROM screens s WHERE s.org_id=o.id AND s.active=1) AS screens_used
                FROM organizations o ORDER BY o.name""").fetchall()
        else:
            rows = db.execute("""SELECT o.*,
                (SELECT COUNT(*) FROM users u WHERE u.org_id=o.id AND u.active=1) AS users_used,
                (SELECT COUNT(*) FROM screens s WHERE s.org_id=o.id AND s.active=1) AS screens_used
                FROM organizations o WHERE o.id=?""", (user["org_id"],)).fetchall()
        return [dict(x) for x in rows]


@app.post("/api/organizations")
def create_org(data: OrganizationCreate, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_admin(user)
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", data.email):
        raise HTTPException(422, "Ongeldig e-mailadres")
    org_id = str(uuid.uuid4())
    with connection() as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            db.execute("INSERT INTO organizations(id,name,slug,created_at) VALUES(?,?,?,?)",
                       (org_id, data.name.strip(), data.slug, now()))
            db.execute("INSERT INTO organization_settings(org_id,settings_json) VALUES(?,?)", (org_id, json.dumps(DEFAULT_SETTINGS)))
            db.execute("""INSERT INTO users(id,org_id,email,display_name,password_hash,role,created_at)
                          VALUES(?,?,?,?,?,'org_admin',?)""",
                       (str(uuid.uuid4()), org_id, data.email.strip().lower(), data.display_name.strip(), PH.hash(data.password), now()))
            audit(db, user, "organization.created", org_id, {"name": data.name})
            db.execute("COMMIT")
        except sqlite3.IntegrityError:
            db.execute("ROLLBACK")
            raise HTTPException(409, "Bedrijfsnaamcode of e-mailadres bestaat al")
    return {"id": org_id, "created": True}


class LicenseUpdate(BaseModel):
    max_users: int = Field(ge=1, le=100)
    max_screens: int = Field(ge=1, le=100)
    active: bool = True


@app.put("/api/organizations/{org_id}/licenses")
def update_licenses(org_id: str, data: LicenseUpdate, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_admin(user)
    with connection() as db:
        existing = db.execute("SELECT id FROM organizations WHERE id=?", (org_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Bedrijf niet gevonden")
        db.execute("UPDATE organizations SET max_users=?, max_screens=?, active=? WHERE id=?",
                   (data.max_users, data.max_screens, int(data.active), org_id))
        audit(db, user, "licenses.updated", org_id, data.model_dump())
    return {"ok": True}


class UserCreate(BaseModel):
    email: str = Field(min_length=6, max_length=180)
    display_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=16, max_length=256)
    role: str = "editor"


@app.get("/api/organizations/{org_id}/users")
def users(org_id: str, request: Request):
    user = current_user(request)
    ensure_org(request, user, org_id)
    with connection() as db:
        return [dict(r) for r in db.execute("SELECT id,email,display_name,role,active,must_change_password FROM users WHERE org_id=? ORDER BY created_at", (org_id,))]


@app.post("/api/organizations/{org_id}/users")
def create_user(org_id: str, data: UserCreate, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_org(request, user, org_id, edit=True)
    if user["role"] not in ("superadmin", "org_admin"):
        raise HTTPException(403, "Alleen bedrijfsbeheerders mogen accounts maken")
    if data.role not in ("editor", "org_admin"):
        raise HTTPException(422, "Ongeldige rol")
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        count = db.execute("SELECT COUNT(*) AS n FROM users WHERE org_id=? AND active=1", (org_id,)).fetchone()["n"]
        org = db.execute("SELECT max_users FROM organizations WHERE id=? AND active=1", (org_id,)).fetchone()
        if not org or count >= org["max_users"]:
            db.execute("ROLLBACK")
            raise HTTPException(409, "Geen vrije accountlicentie. Koop eerst een extra account.")
        try:
            user_id = str(uuid.uuid4())
            db.execute("INSERT INTO users(id,org_id,email,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)",
                       (user_id, org_id, data.email.strip().lower(), data.display_name.strip(), PH.hash(data.password), data.role, now()))
            audit(db, user, "user.created", org_id, {"user_id": user_id})
            db.execute("COMMIT")
        except sqlite3.IntegrityError:
            db.execute("ROLLBACK")
            raise HTTPException(409, "E-mailadres bestaat al")
    return {"id": user_id}


@app.post("/api/organizations/{org_id}/users/{user_id}/deactivate")
def deactivate_user(org_id: str, user_id: str, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_org(request, user, org_id, edit=True)
    if user["role"] not in ("superadmin", "org_admin"):
        raise HTTPException(403, "Geen toestemming")
    if user["id"] == user_id:
        raise HTTPException(400, "Je kunt je eigen account niet uitschakelen")
    with connection() as db:
        record = db.execute("SELECT id FROM users WHERE id=? AND org_id=?", (user_id, org_id)).fetchone()
        if not record:
            raise HTTPException(404, "Account niet gevonden")
        db.execute("UPDATE users SET active=0 WHERE id=?", (user_id,))
        db.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        audit(db, user, "user.deactivated", org_id, {"user_id": user_id})
    return {"ok": True}


@app.get("/api/organizations/{org_id}/screens")
def screens(org_id: str, request: Request):
    user = current_user(request)
    ensure_org(request, user, org_id)
    with connection() as db:
        return [{**dict(r), "schedule": json_value(r, "schedule_json", DEFAULT_SCHEDULE)}
                for r in db.execute("SELECT id,name,active,last_seen,created_at,schedule_json FROM screens WHERE org_id=? ORDER BY created_at", (org_id,))]


@app.post("/api/player/pair/start")
def pair_start(request: Request):
    existing = request.cookies.get(DEVICE_COOKIE)
    with connection() as db:
        if existing:
            screen = db.execute("SELECT id FROM screens WHERE token_hash=? AND active=1", (sha(existing),)).fetchone()
            if screen:
                return {"paired": True}
        device = random_token()
        code = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8))
        db.execute("DELETE FROM pairings WHERE expires_at<? OR claimed_screen_id IS NOT NULL", (now(),))
        db.execute("INSERT INTO pairings(code,device_hash,created_at,expires_at) VALUES(?,?,?,?)", (code, sha(device), now(), later(600)))
    response = JSONResponse({"paired": False, "code": code, "expires_in": 600})
    set_cookie(response, DEVICE_COOKIE, device, 365)
    return response


@app.get("/api/player/pair/status")
def pair_status(request: Request):
    device = request.cookies.get(DEVICE_COOKIE, "")
    if not device:
        raise HTTPException(401, "Scherm nog niet gekoppeld")
    with connection() as db:
        screen = db.execute("SELECT id FROM screens WHERE token_hash=? AND active=1", (sha(device),)).fetchone()
        if screen:
            return {"paired": True}
        code = db.execute("SELECT code FROM pairings WHERE device_hash=? AND expires_at>?", (sha(device), now())).fetchone()
        return {"paired": False, "code": code["code"] if code else None}


class PairScreen(BaseModel):
    code: str = Field(min_length=8, max_length=8)
    name: str = Field(min_length=2, max_length=70)


@app.post("/api/organizations/{org_id}/screens/pair")
def pair_screen(org_id: str, data: PairScreen, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_org(request, user, org_id, edit=True)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        pair = db.execute("SELECT * FROM pairings WHERE code=? AND expires_at>? AND claimed_screen_id IS NULL", (data.code.upper(), now())).fetchone()
        if not pair:
            db.execute("ROLLBACK")
            raise HTTPException(404, "Koppelcode verlopen of niet gevonden")
        org = db.execute("SELECT max_screens FROM organizations WHERE id=? AND active=1", (org_id,)).fetchone()
        if not org:
            db.execute("ROLLBACK")
            raise HTTPException(404, "Bedrijf niet gevonden")
        used = db.execute("SELECT COUNT(*) AS n FROM screens WHERE org_id=? AND active=1", (org_id,)).fetchone()["n"]
        replaced = None
        if used >= org["max_screens"]:
            old = db.execute("SELECT id FROM screens WHERE org_id=? AND active=1 ORDER BY COALESCE(last_seen, created_at), created_at LIMIT 1", (org_id,)).fetchone()
            if old:
                replaced = old["id"]
                db.execute("UPDATE screens SET active=0 WHERE id=?", (replaced,))
        screen_id = str(uuid.uuid4())
        db.execute("INSERT INTO screens(id,org_id,name,token_hash,created_at,schedule_json) VALUES(?,?,?,?,?,?)",
                   (screen_id, org_id, data.name.strip(), pair["device_hash"], now(), json.dumps(DEFAULT_SCHEDULE)))
        db.execute("UPDATE pairings SET claimed_screen_id=? WHERE code=?", (screen_id, data.code.upper()))
        audit(db, user, "screen.paired", org_id, {"screen_id": screen_id, "replaced": replaced})
        db.execute("COMMIT")
    return {"screen_id": screen_id, "replaced_screen_id": replaced}


class ScreenSchedule(BaseModel):
    enabled: bool = False
    timezone: str = "Europe/Amsterdam"
    days: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])
    on: str = "07:30"
    off: str = "18:00"
    cec_enabled: bool = False


@app.put("/api/organizations/{org_id}/screens/{screen_id}/schedule")
def update_schedule(org_id: str, screen_id: str, data: ScreenSchedule, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_org(request, user, org_id, edit=True)
    if not all(0 <= d <= 6 for d in data.days) or data.timezone != "Europe/Amsterdam":
        raise HTTPException(422, "Ongeldige dag of tijdzone")
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", data.on) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", data.off):
        raise HTTPException(422, "Ongeldige tijd")
    with connection() as db:
        result = db.execute("UPDATE screens SET schedule_json=? WHERE id=? AND org_id=? AND active=1",
                            (data.model_dump_json(), screen_id, org_id))
        if not result.rowcount:
            raise HTTPException(404, "Scherm niet gevonden")
        audit(db, user, "screen.schedule", org_id, {"screen_id": screen_id})
    return {"ok": True, "cec_hardware_control_available": False}


@app.post("/api/organizations/{org_id}/screens/{screen_id}/disconnect")
def disconnect_screen(org_id: str, screen_id: str, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_org(request, user, org_id, edit=True)
    with connection() as db:
        r = db.execute("UPDATE screens SET active=0 WHERE id=? AND org_id=?", (screen_id, org_id))
        if not r.rowcount:
            raise HTTPException(404, "Scherm niet gevonden")
        audit(db, user, "screen.disconnected", org_id, {"screen_id": screen_id})
    return {"ok": True}


@app.get("/api/organizations/{org_id}/slides")
def slides(org_id: str, request: Request):
    user = current_user(request)
    ensure_org(request, user, org_id)
    with connection() as db:
        return [dict(s) for s in db.execute("SELECT id,title,kind,duration,enabled,sort_order,created_at FROM slides WHERE org_id=? ORDER BY sort_order,created_at", (org_id,))]


def check_youtube(value: str):
    parsed = urlparse(value.strip())
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in ("youtube.com", "www.youtube.com", "youtu.be", "www.youtube-nocookie.com"):
        raise HTTPException(422, "Gebruik een geldige https-YouTube-link")
    if host == "youtu.be":
        video_id = parsed.path.strip("/")
    elif parsed.path.startswith("/embed/"):
        video_id = parsed.path.split("/")[2]
    else:
        video_id = parse_qs(parsed.query).get("v", [""])[0]
    if not re.fullmatch("[a-zA-Z0-9_-]{11}", video_id):
        raise HTTPException(422, "YouTube-video-ID ongeldig")
    return "https://www.youtube-nocookie.com/embed/" + video_id


class AddLink(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    url: str
    duration: int = Field(ge=5, le=600)


@app.post("/api/organizations/{org_id}/slides/youtube")
def add_youtube(org_id: str, data: AddLink, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_org(request, user, org_id, edit=True)
    url = check_youtube(data.url)
    slide_id = str(uuid.uuid4())
    with connection() as db:
        order = db.execute("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM slides WHERE org_id=?", (org_id,)).fetchone()["n"]
        db.execute("INSERT INTO slides(id,org_id,title,kind,external_url,duration,sort_order,created_at) VALUES(?,?,?,'youtube',?,?,?,?)",
                   (slide_id, org_id, data.title.strip(), url, data.duration, order, now()))
        audit(db, user, "slide.youtube", org_id, {"slide_id": slide_id})
    return {"id": slide_id, "note": "Online YouTube kan door autoplay-/embedbeperkingen niet gegarandeerd afspelen"}


def convert_document(src: Path, dst_dir: Path, suffix: str):
    import fitz
    pdf_file = src
    if suffix == ".pptx":
        # Bestanden met PowerPoint-animaties worden als gewone dia's gerenderd.
        work_profile = dst_dir / "lo-profile"
        cmd = ["libreoffice", f"-env:UserInstallation={work_profile.as_uri()}", "--headless", "--convert-to", "pdf", "--outdir", str(dst_dir), str(src)]
        try:
            result = subprocess.run(cmd, text=True, capture_output=True, timeout=120, check=False)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            raise HTTPException(422, "PowerPoint-conversie niet beschikbaar of verlopen")
        pdf_file = dst_dir / (src.stem + ".pdf")
        if result.returncode or not pdf_file.exists():
            raise HTTPException(422, "PowerPoint kon niet worden geconverteerd")
    files = []
    try:
        with fitz.open(pdf_file) as document:
            if document.page_count < 1 or document.page_count > 80:
                raise HTTPException(422, "Document moet 1 tot 80 pagina's bevatten")
            for i, page in enumerate(document):
                pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                out = dst_dir / f"page-{i+1:03}.png"
                pix.save(out)
                files.append(out)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, "Document kon niet worden gelezen")
    return files


@app.post("/api/organizations/{org_id}/slides/upload")
async def upload_slides(org_id: str, request: Request, file: UploadFile = File(...), duration: int = Form(10)):
    user = current_user(request)
    require_csrf(request, user)
    ensure_org(request, user, org_id, edit=True)
    if not 2 <= duration <= 600:
        raise HTTPException(422, "Dia moet 2 tot 600 seconden duren")
    filename = Path(file.filename or "bestand").name
    suffix = Path(filename).suffix.lower()
    allowed = {".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image",
               ".mp4": "video", ".webm": "video", ".pdf": "document", ".pptx": "document"}
    if suffix not in allowed:
        raise HTTPException(422, "Ondersteund: afbeeldingen, mp4/webm, pdf en pptx")
    raw = await file.read(MAX_UPLOAD + 1)
    if not raw or len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "Bestand is leeg of groter dan 50 MB")
    if suffix == ".pdf" and not raw.startswith(b"%PDF-"):
        raise HTTPException(422, "Ongeldig PDF-bestand")
    if suffix == ".pptx":
        import zipfile
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                if "ppt/presentation.xml" not in z.namelist():
                    raise HTTPException(422, "Ongeldig PowerPoint-bestand")
        except (zipfile.BadZipFile, ValueError):
            raise HTTPException(422, "Ongeldig PowerPoint-bestand")
    if allowed[suffix] == "image":
        from PIL import Image
        try:
            with Image.open(io.BytesIO(raw)) as img:
                img.verify()
        except Exception:
            raise HTTPException(422, "Ongeldige afbeelding")
    if suffix == ".mp4" and b"ftyp" not in raw[:32]:
        raise HTTPException(422, "Ongeldig MP4-bestand")
    if suffix == ".webm" and not raw.startswith(b"\x1a\x45\xdf\xa3"):
        raise HTTPException(422, "Ongeldig WebM-bestand")
    folder = UPLOAD / org_id
    folder.mkdir(parents=True, exist_ok=True)
    item_dir = folder / uuid.uuid4().hex
    item_dir.mkdir()
    original = item_dir / ("original" + suffix)
    original.write_bytes(raw)
    try:
        sources = convert_document(original, item_dir, suffix) if allowed[suffix] == "document" else [original]
        ids = []
        with connection() as db:
            db.execute("BEGIN IMMEDIATE")
            sort = db.execute("SELECT COALESCE(MAX(sort_order),0) AS n FROM slides WHERE org_id=?", (org_id,)).fetchone()["n"]
            for i, asset in enumerate(sources):
                slide_id = str(uuid.uuid4())
                db.execute("INSERT INTO slides(id,org_id,title,kind,filename,duration,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?)",
                           (slide_id, org_id, filename + (f" – dia {i+1}" if len(sources) > 1 else ""),
                            "image" if allowed[suffix] == "document" else allowed[suffix],
                            str(asset.relative_to(UPLOAD)), duration, sort+i+1, now()))
                ids.append(slide_id)
            audit(db, user, "slides.uploaded", org_id, {"count": len(ids), "type": suffix})
            db.execute("COMMIT")
        return {"ids": ids, "count": len(ids), "note": "PowerPoint-dia's worden omgezet naar afbeeldingen; animaties blijven niet behouden" if suffix == ".pptx" else None}
    except Exception:
        shutil.rmtree(item_dir, ignore_errors=True)
        raise


class SlidePatch(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    duration: int | None = Field(default=None, ge=2, le=600)
    enabled: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=100000)


@app.patch("/api/organizations/{org_id}/slides/{slide_id}")
def update_slide(org_id: str, slide_id: str, data: SlidePatch, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_org(request, user, org_id, edit=True)
    updates = {k: (int(v) if isinstance(v, bool) else v) for k,v in data.model_dump(exclude_none=True).items()}
    if not updates:
        return {"ok": True}
    with connection() as db:
        row = db.execute("SELECT id FROM slides WHERE id=? AND org_id=?", (slide_id, org_id)).fetchone()
        if not row:
            raise HTTPException(404, "Dia niet gevonden")
        db.execute("UPDATE slides SET " + ",".join(f"{k}=?" for k in updates) + " WHERE id=? AND org_id=?", (*updates.values(), slide_id, org_id))
        audit(db, user, "slide.updated", org_id, {"slide_id": slide_id})
    return {"ok": True}


@app.delete("/api/organizations/{org_id}/slides/{slide_id}")
def delete_slide(org_id: str, slide_id: str, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_org(request, user, org_id, edit=True)
    with connection() as db:
        record = db.execute("SELECT id FROM slides WHERE id=? AND org_id=?", (slide_id, org_id)).fetchone()
        if not record:
            raise HTTPException(404, "Dia niet gevonden")
        db.execute("DELETE FROM slides WHERE id=? AND org_id=?", (slide_id, org_id))
        audit(db, user, "slide.deleted", org_id, {"slide_id": slide_id})
    # Fysieke media blijft bewaard tot een veilige, afzonderlijke opruimactie/back-upcyclus.
    return {"ok": True}


class OrgSettings(BaseModel):
    show_clock: bool = True
    show_weather: bool = False
    show_news: bool = False
    news_mode: str = "ticker"
    weather_location: str = Field(default="Dordrecht", max_length=80)
    background: str = Field(default="#0b1624", pattern=r"^#[0-9a-fA-F]{6}$")
    background_mode: str = "black"


@app.get("/api/organizations/{org_id}/settings")
def get_settings(org_id: str, request: Request):
    user = current_user(request)
    ensure_org(request, user, org_id)
    with connection() as db:
        return org_settings(db, org_id)


@app.put("/api/organizations/{org_id}/settings")
def put_settings(org_id: str, data: OrgSettings, request: Request):
    user = current_user(request)
    require_csrf(request, user)
    ensure_org(request, user, org_id, edit=True)
    if data.news_mode not in ("ticker", "pages") or data.background_mode not in ("black", "color", "blur"):
        raise HTTPException(422, "Ongeldige instellingen")
    with connection() as db:
        result = db.execute("UPDATE organization_settings SET settings_json=? WHERE org_id=?", (data.model_dump_json(), org_id))
        if not result.rowcount:
            raise HTTPException(404, "Bedrijf niet gevonden")
        audit(db, user, "settings.updated", org_id)
    return {"ok": True}


def authenticated_media(request, slide_id: str):
    slide = None
    with connection() as db:
        slide = db.execute("SELECT id,org_id,kind,filename FROM slides WHERE id=?", (slide_id,)).fetchone()
        if not slide or not slide["filename"]:
            raise HTTPException(404, "Bestand niet gevonden")
        has_access = False
        try:
            user = current_user(request)
            has_access = user["role"] == "superadmin" or user["org_id"] == slide["org_id"]
        except HTTPException:
            pass
        if not has_access:
            token = request.cookies.get(DEVICE_COOKIE, "")
            if token:
                sc = db.execute("SELECT id FROM screens WHERE token_hash=? AND org_id=? AND active=1", (sha(token), slide["org_id"])).fetchone()
                has_access = sc is not None
        if not has_access:
            raise HTTPException(403, "Geen toegang tot dit bestand")
        root = UPLOAD.resolve()
        filepath = (UPLOAD / slide["filename"]).resolve()
        if not filepath.is_relative_to(root) or not filepath.is_file():
            raise HTTPException(404, "Bestand ontbreekt")
        return filepath


@app.get("/api/media/{slide_id}")
def media(slide_id: str, request: Request):
    filepath = authenticated_media(request, slide_id)
    kind = filepath.suffix.lower()
    types = {".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",
             ".gif":"image/gif",".mp4":"video/mp4",".webm":"video/webm"}
    response = FileResponse(filepath, media_type=types.get(kind, "application/octet-stream"))
    response.headers["Cache-Control"] = "private, max-age=3600"
    return response


def authenticated_screen(request):
    token = request.cookies.get(DEVICE_COOKIE, "")
    if not token:
        raise HTTPException(401, "Scherm niet gekoppeld")
    with connection() as db:
        row = db.execute("""SELECT s.*,o.name AS org_name,o.active AS org_active FROM screens s
                 JOIN organizations o ON o.id=s.org_id WHERE s.token_hash=? AND s.active=1""", (sha(token),)).fetchone()
        if not row or not row["org_active"]:
            raise HTTPException(401, "Schermkoppeling verlopen of vervangen")
        return dict(row)


@app.get("/api/player/state")
def player_state(request: Request):
    screen = authenticated_screen(request)
    with connection() as db:
        db.execute("UPDATE screens SET last_seen=? WHERE id=?", (now(), screen["id"]))
        org_id = screen["org_id"]
        active = db.execute("SELECT max_screens FROM organizations WHERE id=?", (org_id,)).fetchone()
        # Bij licentieverlaging mogen slechts de meest recent gekoppelde schermen actief blijven.
        ids = [r["id"] for r in db.execute("SELECT id FROM screens WHERE org_id=? AND active=1 ORDER BY created_at DESC LIMIT ?", (org_id, active["max_screens"]))]
        if screen["id"] not in ids:
            raise HTTPException(403, "Schermlicentie niet meer beschikbaar")
        entries = [dict(r) for r in db.execute("SELECT id,title,kind,duration,external_url FROM slides WHERE org_id=? AND enabled=1 ORDER BY sort_order,created_at", (org_id,))]
        for slide in entries:
            slide["src"] = ("/api/media/"+slide["id"]) if slide["kind"] in ("image","video") else slide["external_url"]
            slide.pop("external_url", None)
        return {"screen": {"id":screen["id"], "name":screen["name"], "company":screen["org_name"]},
                "settings": org_settings(db, org_id),
                "schedule": json_value(screen, "schedule_json", DEFAULT_SCHEDULE),
                "slides": entries, "updated": now(), "cec_control_available": False}


@app.get("/api/organizations/{org_id}/audit")
def get_audit(org_id: str, request: Request):
    user = current_user(request)
    ensure_org(request, user, org_id)
    with connection() as db:
        return [dict(r) for r in db.execute("SELECT action,details,created_at FROM audit_log WHERE org_id=? ORDER BY id DESC LIMIT 30", (org_id,))]
