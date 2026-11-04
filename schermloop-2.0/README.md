# SchermLoop 2.0 — nieuwe, aparte commerciële versie

**Eerste installatie op je eigen Coolify-server:** lees [INSTALLATIE-COOLIFY.md](INSTALLATIE-COOLIFY.md). Er is een apart `docker-compose.coolify.yml` dat wachtwoorden automatisch via Coolify laat genereren. Voorlopig alleen in een testomgeving plaatsen.

Dit is een zelfstandige ontwikkeling in de branch schermloop-2.0, in de map schermloop-2.0.
De bestaande SchermLoop op main blijft ongemoeid. Niet live inzetten voordat de beveiliging
en AVG-controles zijn afgerond.

## Eerste versie

- Bedrijfsaccounts met eigen login (geen GitHub-tokens voor klanten).
- Standaard 1 beheeraccount en 1 gekoppeld scherm per bedrijf.
- Hoofdbeheerder kan extra account- en schermlicenties toekennen.
- Koppelcode per apparaat; nieuwe koppeling op hetzelfde scherm verbreekt oude sessie.
- Beveiligde opslag, private uploads, afspeellijst, tijdsduur, verbergen, sorteren.
- Video, afbeeldingen, tekst, PDF en PPTX als afbeeldingen per pagina. Video's worden in de automatische lus volledig afgespeeld.
- Schermspeler met automatische en handmatige bediening.
- USB-presentatieklikker: ArrowLeft/Right, PageUp/Down, Home/End, handmatig/automatisch omschakelen; na 30 minuten zonder bediening terug naar automatische lus. Compatibiliteit per klikker blijft te testen.
- Schermachtergrond per scherm: zwart, effen kleur of vervaagde afbeelding (originele dia scherp).
- Eigen lichtkrant onderaan het scherm en automatisch tekstnieuws van de Rijksoverheid; per scherm instelbaar als nieuwslichtkrant of volledige nieuwsdiapagina. NU.nl blijft buiten de commerciële versie totdat rechten zijn geregeld.
- Klant kiest een eigen weerplaats uit een lijst wereldwijde steden. De locatie wordt uitsluitend in de eigen bedrijfsomgeving opgeslagen. Per scherm afzonderlijke keuze voor volledige weerpagina, aantal seconden en het weer in de hoek. Weergegevens via MET Norway, zonder klant-API-tokens.
- Tijdschema voor weergave; HDMI-CEC fysieke tv-bediening is nog NIET gebouwd.

## Nog te bouwen voor volledige verkoopversie

Online betaling, facturering, e-mailuitnodigingen, volledige
PowerPoint-animaties, NU.nl-nieuws, Excel-/OneDrive-koppelingen, notificaties,
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
- Eén actieve afspeelsessie per logisch scherm wordt nu afgedwongen: een nieuwe sessie trekt de oude in en de speler controleert elke 10 seconden. Een gekopieerde apparaatsleutel kan nog een nieuwe sessie overnemen, maar mag geen twee gelijktijdig geautoriseerde sessies opleveren. Een reeds offline spelend apparaat is zonder netwerkverbinding niet direct te stoppen.
- Er is nog geen implementatie voor veilige persistent offline bestanden en het fysiek schakelen van de tv via HDMI-CEC.
- Er is nog geen deployment naar de eigen Coolify-server uitgevoerd.

## Voortgang: bedrijfsbeheer en support

- Bedrijfsbeheerder kan een medewerker-account activeren of uitschakelen zonder persoonsgegevens te verwijderen.
  Bij uitschakeling worden de bestaande inlogsessies van die medewerker ingetrokken; opnieuw activeren
  is alleen toegestaan wanneer de accountlimiet dat toelaat. De hoofdbeheerder van het bedrijf
  kan niet via deze functie worden uitgeschakeld.
- De database bereidt een supportauditlog voor. De losse supportmodule en tests staan in de code,
  maar de module is nog niet gekoppeld aan de actieve routes. Het supportdashboard is daarom
  **nog niet bruikbaar**.
- Het oude, in gebruik zijnde SchermLoop-private-project wordt niet aangepast. Een overname
  volgt pas na een volledige productietest, back-up en afgesproken omschakelmoment.
- De losse ontwikkeltak is onderdeel van een **openbare** GitHub-repository; voeg nooit echte
  klantdata of geheime sleutels toe. Voor commerciële uitrol migreren naar een aparte private
  repository.

## Weer per bedrijf (ontwikkelversie)

- Een bedrijfsbeheerder zoekt op plaatsnaam en kiest een stad uit de lijst. De standaardlocatie is Dordrecht.
- Andere bedrijven kunnen hun eigen stad kiezen; de backend controleert de geselecteerde coördinaten.
- De scherminstellingen bepalen apart of de weerpagina en/of een klein hoekblok zichtbaar is.
- Volledige weerpagina: actuele verwachte temperatuur, omschrijving, wind, vochtigheid en uurlijkse neerslaggrafiek. Categorieën Droog/Licht/Matig/Zwaar.
- Dit is een **uurlijkse modelverwachting**, geen live Buienradar-vijfminutenradar en geen actuele regenmeting. De live weergave moet nog op echte televisies worden getest.
- Data: [MET Norway](https://api.met.no/) onder Creative Commons BY 4.0, via een gecachte serveraanvraag (dus zonder IP-adres van de klant naar MET Norway). Plaatsnamen: GeoNames via [cities.json](https://www.npmjs.com/package/cities.json), eveneens CC BY 4.0. Vermeld beide bronnen bij commercieel gebruik en geef aan dat we de weersdata vertalen/samenvatten.
- MET Norway vereist een herkenbare User-Agent. Configureer optioneel MET_WEATHER_USER_AGENT in de serveromgeving; **geen API-sleutel nodig**.
- Nog niet ingebouwd: historische weerdata, automatische vijfminutenregenradar, wereldwijde lokale tijdzone voor de schermklok. De SchermLoop-schermklok toont voorlopig Nederlandse tijd.

## Plaatsbaarheid

- CI test nu ook de volledige Coolify Compose-stack: bouwt een eigen Docker-image, start PostgreSQL + SchermLoop, controleert `/healthz` en ruimt de tijdelijke testdata op.
- Inlogwachtwoorden zijn via het dashboard te wijzigen (ook hoofdbeheer). Nieuwe accounts tonen tijdelijk een kopieerbaar eenmalig wachtwoord.
- Coolify gebruikt een eigen database en twee blijvende Docker-volumes. Er wordt niets in de huidige SchermLoop-database geschreven.
- **Nog geen commerciële productie:** onafhankelijke back-ups en hersteltest, herstel van wachtwoorden, formele AVG-documentatie, externe beveiligingscontrole en de resterende nieuws/Excel/OneDrive/PowerPoint-functies ontbreken nog.

## Nieuws en rechten

- SchermLoop 2.0 biedt nu een instelbare nieuwsfeed met alleen tekstkoppen van de Rijksoverheid (CC0, met bronvermelding en zonder indruk van officiële steun). De inhoud wordt op de server maximaal 30 minuten gecachet; bij storingen kan kort een vorige versie worden gebruikt.
- De oude SchermLoop gebruikte NU.nl RSS en nieuwsbeelden. Voor een betaalde commerciële narrowcastingdienst is daarvoor een expliciete licentie-/rechtencontrole nodig; het systeem schakelt die bron niet automatisch in.
- Het nieuws in 2.0 is daarom functioneel alternatief, nog niet identiek aan het oorspronkelijke NU.nl-nieuwsblok.

## Mededelingen en offline

- Excel-mededelingen: importeer .xlsx met Titel, Tekst, Seconden en Tonen; max. 50 actieve regels. De vorige Excel-import wordt alleen met bevestiging vervangen, handmatige dia's blijven bestaan. Rechtstreekse automatische OneDrive-synchronisatie volgt nog.
- Bij ondersteunde browsers bewaart de speler na succesvolle synchronisatie een lokale afspeellijst, maximaal 30 voor te laden mediabestanden en de laatst opgehaalde weer- en nieuwsgegevens. De opslag is afhankelijk van browserquota. Er is een service worker die de speler offline kan openen. Een definitief ingetrokken scherm kan zonder netwerkverbinding niet direct worden gestopt.

## Migratie van de vorige versie

- `node scripts/inspect-legacy.js <pad-naar-bestaande-back-up>` controleert oude data en mediapaden **alleen-lezen**.
- `node scripts/import-old.js <pad-naar-bestaande-back-up>` is eveneens een dry-run. Met `--apply` en afzonderlijke `TARGET_ORG_ID` en `TARGET_SCREEN_ID` kan een beheerder data uitsluitend in een leeg, nog niet gekoppeld testscherm importeren. Er worden geen bronbestanden aangepast; foutieve imports worden teruggedraaid.
- Een actieve oude NU.nl-nieuwsinstelling blokkeert standaard een volledige import zolang er geen rechten/oplossing voor zijn; uitsluitend tijdens interne proefimport is `--test-without-news` mogelijk.
- De vorige private repository blijft staan als terugvalpunt totdat alle functies zijn gecontroleerd.
