# SchermLoop 2.0 - gecontroleerde migratie vanuit de bestaande privéomgeving

Deze procedure is **voorbereiding**, geen opdracht om de actuele SchermLoop te overschrijven. De productieomgeving blijft actief totdat de nieuwe versie is getest op de eigen server.

## Bron en privacy

De bestaande privéomgeving bevat afspeellijsten, instellingen, mededelingen en mediabestanden. Deze gegevens blijven **privé**. Kopieer ze nooit naar de openbare ontwikkeltak. De nieuwe versie slaat gegevens op in PostgreSQL en een eigen permanent volume.

De migratie wordt bij de eerste overstap uitgevoerd vanuit een privéback-up op de server, niet vanuit de publieke broncode. Wijzig of verwijder nooit de huidige bronnen tijdens import.

## Verplichte stappen vóór overschakelen

1. Draai de complete SchermLoop 2.0 testversie naast de huidige versie op een **ander** subdomein.
2. Maak een onafhankelijke back-up van de huidige privé-repository, media, instellingen en eventuele live gegevens. Bewaar de exacte commit-ID en exporttijd.
3. Controleer voor import de bestandsaantallen en alle verwijzingen naar media. Maak een rapport van ontbrekende bestanden en ongeldige dia's.
4. Maak een apart testbedrijf voor de bestaande schoolomgeving. Importeer in die ene testomgeving; laat andere bedrijven volledig gescheiden.
5. Zet achtergronden, presentatietijden, klok, nieuws, weer en de bestaande mededelingen om naar de nieuwe instellingen. Een functie die nog niet bestaat krijgt een duidelijke waarschuwing en wordt **niet stilzwijgend weggelaten**.
6. Vergelijk aantallen dia's, bestandsnamen, volgorde, afspeelduur en zichtbaarheidsinstellingen.
7. Test alle presentaties op de aangesloten Windows-mini-pc. Controleer start na herstart, lange video, PowerPoint/PDF, weer, klok, klikker en netwerkonderbreking.
8. Maak een onafhankelijke terugzetbare back-up van de nieuwe PostgreSQL-database en alle uploads. Voer een echte hersteltest uit.
9. Schakel pas na geslaagde controles het schermadres over. Verander de oude repository niet; houd die minstens één release als terugvaloptie beschikbaar.

## Terugval

Bij een probleem: laat de oude SchermLoop draaien en zet het afspeelapparaat terug naar het bestaande presentatieadres. De gegevens van de oude omgeving blijven ongewijzigd. De nieuwe PostgreSQL-gegevens en uploads blijven apart beschikbaar voor onderzoek. Verwijder de nieuwe omgeving niet automatisch.

## Wanneer de oude privé-repository hergebruiken?

Pas wanneer alle vereiste functionaliteit, migratie en terugvalprocedure zijn geverifieerd. **Nooit** oude schoolmedia of configuratie overschrijven zonder eerst een herstelde back-up te testen. Het is eenvoudiger de nieuwe applicatie op een afzonderlijke privé-repository te laten draaien en de oude privéomgeving als archief te behouden; het hernoemen of hergebruiken van de bestaande repository is geen vereiste om de schermen over te zetten.

## Acceptatie voor een eerste testplaatsing

- GitHub CI: syntax, database-integratie, Docker-image en tijdelijke PostgreSQL-container succesvol.
- Inloggen met hoofdbeheer- en bedrijfsaccount werkt.
- Eén logisch scherm en één actuele afspeelsessie per basislicentie.
- App en database blijven functioneren na restart.
- Een kleine set eigen demo-dia's wordt afgespeeld; geen publieke distributie van bestaande privémedia.
- Database, bestanden en schermkoppeling zijn volledig gescheiden van het huidige systeem.

## Acceptatie voor daadwerkelijke vervanging

Alles hierboven, plus functionele parity voor nieuws, weer, Excel-/OneDrive-koppelingen en alle onderdelen waarop de school afhankelijk is; hersteltest van onafhankelijke back-up; langere stabiliteitstest; verantwoord beheer van wachtwoordherstel, AVG en gebruikersrollen. Zonder deze voorwaarden is de vervanging **niet klaar**.
