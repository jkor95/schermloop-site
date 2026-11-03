# SchermLoop 2.0 — nieuwe, aparte commerciële versie

Dit is een zelfstandige ontwikkeling in de branch schermloop-2.0, in de map schermloop-2.0.
De bestaande SchermLoop op main blijft ongemoeid. Niet live inzetten voordat de beveiliging
en AVG-controles zijn afgerond.

## Eerste versie

- Bedrijfsaccounts met eigen login (geen GitHub-tokens voor klanten).
- Standaard 1 beheeraccount en 1 gekoppeld scherm per bedrijf.
- Hoofdbeheerder kan extra account- en schermlicenties toekennen.
- Koppelcode per apparaat; nieuwe koppeling op hetzelfde scherm verbreekt oude sessie.
- Beveiligde opslag, private uploads, afspeellijst, tijdsduur, verbergen, sorteren.
- Video, afbeeldingen, tekst, PDF en PPTX als afbeeldingen per pagina.
- Schermspeler met automatische en handmatige bediening.
- USB-presentatieklikker: ArrowLeft/Right, PageUp/Down, Home/End, handmatig/automatisch omschakelen; na 30 minuten zonder bediening terug naar automatische lus. Compatibiliteit per klikker blijft te testen.
- Schermachtergrond per scherm: zwart, effen kleur of vervaagde afbeelding (originele dia scherp).
- Eigen lichtkrant onderaan het scherm, configureerbaar per bedrijf en scherm. De automatische nieuwsfeed van NU.nl is nog niet gemigreerd.
- Tijdschema voor weergave; HDMI-CEC fysieke tv-bediening is nog NIET gebouwd.

## Nog te bouwen voor volledige verkoopversie

Online betaling, facturering, e-mailuitnodigingen, offline caching, volledige
PowerPoint-animaties, nieuws, weer, Excel-/OneDrive-koppelingen, notificaties,
uitgebreid rechtenbeheer, onafhankelijke back-ups, hardening en AVG-documentatie.

## Lokaal proberen

Maak een .env met DB_PASSWORD, APP_SECRET (minimaal 32 tekens), ADMIN_EMAIL,
ADMIN_PASSWORD en PUBLIC_URL. Deel wachtwoorden niet via chat of GitHub.
Voer docker compose up --build -d uit. Open / en meld je aan met het
superbeheeraccount, maak een demo-organisatie en log daarmee in. Open /player
op de tv of andere browser; voer de getoonde code in via het beheer.

## Coolify

Gebruik een volledig nieuwe applicatie in Coolify op eigen domein/subdomein.
Voor een Dockerfile-build: root/build-context schermloop-2.0, Dockerfile op
schermloop-2.0/Dockerfile, PostgreSQL-database apart via Coolify en
persistent volume voor STORAGE_DIR=/app/storage. De bijgevoegde compose is
bedoeld voor lokale tests. De productieapp is nog niet gedeployed.

## Status en aandachtspunten

- Huidige productie-app op de standaardbranch blijft onaangetast.
- De GitHub CI controleert JavaScript-syntaxis, basisregels en integratietests met een tijdelijke PostgreSQL-database.
- De losse supportmodule (`support.js`) en de bijbehorende unit-tests zijn toegevoegd, maar de module is nog niet aan de actieve Express-server gekoppeld. Nog niet bruikbaar via de beheerpagina.
- Automatische retour naar de dia-lus is op 30 minuten ingesteld; dit is een voorlopige standaard die later configureerbaar kan worden.
- Koppelen van één logisch scherm en intrekken van een vorige apparaatsleutel is geïmplementeerd, maar bescherming tegen gelijktijdig hergebruik van een gekopieerde apparaatsleutel is nog niet compleet.
- Er is nog geen implementatie voor veilige persistent offline bestanden en het fysiek schakelen van de tv via HDMI-CEC.
- Er is nog geen deployment naar de eigen Coolify-server uitgevoerd.
