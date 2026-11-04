# SchermLoop 2.0 op je eigen Coolify-server installeren

**Status: aparte ontwikkel-/testomgeving, niet de bestaande SchermLoop vervangen.**

Deze installatie maakt een nieuwe webapp en een **nieuwe PostgreSQL-database**. De bestaande JK Works-, Sport-, Meldpunt-, SchermLoop- en andere apps worden niet veranderd. Je hebt **geen GitHub-token of API-token** nodig. Voer wachtwoorden nooit in de chat in.

## In Coolify (één keer)

1. Open je bestaande Coolify-dashboard en kies een **nieuw project of testomgeving** voor SchermLoop 2.0.
2. Kies **+ New → Application**, met een **Public Git Repository** als bron.
   - Repository URL: `https://github.com/jkor95/schermloop-site`
   - Branch: `schermloop-2.0`
   - Build strategy: **Docker Compose**
   - Base Directory: `/schermloop-2.0`
   - Docker Compose Location: `/docker-compose.coolify.yml`
3. Sla de gegevens op en laat Coolify de Compose-inhoud analyseren. Controleer of de services **web** en **db** zijn herkend en dat twee persistent volumes zijn gekoppeld.
4. Onder **Environment Variables**:
   - Geef alleen `ADMIN_EMAIL` op: het e-mailadres waarmee jij de opperhoofdbeheerder wordt.
   - Coolify genereert automatisch `SERVICE_PASSWORD_64_SCHERMLOOPDB`, `SERVICE_PASSWORD_64_SCHERMLOOPSECRET` en `SERVICE_PASSWORD_64_SCHERMLOOPADMIN`. Gebruik de gegenereerde waarden; niet in GitHub opslaan.
   - Controleer `SERVICE_URL_WEB_3000` en `PUBLIC_URL`. Die moeten na domeintoekenning overeenkomen en beginnen met `https://`.
5. Onder **Domains**: koppel alleen de `web`-service aan een **nieuw testsubdomein**, bijvoorbeeld `schermloop2.jkworks.nl` met interne poort **3000**. Coolify kan ook een automatisch testdomein gebruiken als je server daarvoor is ingesteld. Een eigen subdomein heeft een passend DNS-record nodig bij je DNS-provider. Gebruik NIET `jkworks.nl` of `coolify.jkworks.nl` zelf.
6. Klik op **Deploy**. Controleer of `db` en `web` beide **healthy** zijn. Als de app niet start, bekijk dan eerst de deployment- en containerlogs.
7. Open `https://<nieuw-testdomein>/healthz`; dit moet `{"ok":true}` tonen. Open daarna de hoofdpagina, log in met `ADMIN_EMAIL` en de veilige waarde van `SERVICE_PASSWORD_64_SCHERMLOOPADMIN` in Coolify. **Wijzig meteen het wachtwoord** via de knop rechtsboven.
8. Maak een testbedrijf en test met een extra browser op `/player` het koppelen via de 10-letterige code.

> De weerservice MET Norway gebruikt één herkenbare User-Agent in de appconfiguratie, geen token. De onderliggende gegevens zijn voorspellingen per uur; de vijfminutenradar van Buienradar wordt hiermee niet vervangen.

## Belangrijke controles vóór echte klanten

- **Back-ups:** stel een dagelijkse PostgreSQL-back-up én een back-up van `schermloop_files` in, bij voorkeur naar een andere machine/locatie. Een named Docker volume op dezelfde SSD is geen back-up. Probeer terugzetten uit een back-up minstens één keer.
- **Toegang:** gebruik HTTPS, unieke sterke wachtwoorden, en schermcodes om afspeelschermen te koppelen.
- **Accountbeheer:** controleer dat bedrijf A niet bij bedrijf B kan en dat het opperhoofdbeheer de supportacties vastlegt.
- **Licenties:** slechts één actieve afspeelsessie per logisch scherm. Bij verlies van internet kan eerder geladen inhoud nog blijven draaien; afdwingen vereist een online verbinding.
- **Automatisch starten op tv:** Windows/kioskbrowser/autostart op het afspeelapparaat apart testen. HDMI-CEC en volledige PowerPoint-animaties zijn nog niet beschikbaar.
- **Bedrijfsmatig gebruik:** privacybeleid, verwerkersafspraken, een onafhankelijke back-up, beveiligingstest en de nog ontbrekende integraties afronden voordat klanten betalen.

## Problemen die je zonder token kunt controleren

- `/healthz` faalt → controleer de logs van de `web`- en `db`-services.
- Login slaat niet op → controleer HTTPS en of `PUBLIC_URL` overeenkomt met het bereikbare domein.
- Geen weer → controleer internettoegang voor de server en de externe weerbron.
- Een scherm toont steeds een nieuwe koppelcode → controleer of de lokale browseropslag niet steeds wordt gewist.
- Een presentatie wordt na een restart niet hervat → controleer het volume `schermloop_files` en de PostgreSQL-database.
- `Service cannot start: PUBLIC_URL must use HTTPS` → configureer eerst HTTPS in Coolify.

Voorlopig alleen deze afzonderlijke testapp plaatsen. **De originele SchermLoop op main en de bestaande private repository blijven onveranderd.**
