# SchermLoop 2.0 — voorwaarden voor de overname

Deze checklist beschermt de huidige SchermLoop-installatie. **Een geslaagde GitHub-test is niet hetzelfde als een geslaagde plaatsing op de eigen Coolify-server.**

## Automatisch geverifieerd

- [x] SchermLoop 2.0 start met een afzonderlijke PostgreSQL-database in Docker Compose.
- [x] Hoofdbeheerder, bedrijfsaccounts, schermkoppeling en licentielimieten.
- [x] Twee bedrijfsmappen en hun gegevens blijven logisch van elkaar gescheiden.
- [x] Een nieuwe afspeelsessie trekt de vorige afspeelsessie in.
- [x] Afspelen van dia's, eenvoudige USB-klikbediening, weer per bedrijf en de ingestelde lichtkrant.
- [x] XLSX-mededelingen met Titel, Tekst, Seconden en Tonen.
- [x] Browsercontrole van aanmelden, koppelen, presenteren en offline opnieuw openen.
- [x] Migratie van synthetische oude data naar een **leeg** testscherm; de bron blijft ongewijzigd en een tweede import wordt geweigerd.
- [x] Database en media worden gebundeld in één back-uparchief, SHA256-gecontroleerd en in GitHub CI teruggelezen in een andere tijdelijke database.
- [x] Rijksoverheid is als vervangende nieuwsbron gebouwd; oude NU.nl-instellingen mogen alleen met expliciete bronvervanging worden omgezet.

## Nog vereist voor een echte overname

- [ ] Installeer een **afzonderlijke** SchermLoop 2.0-testomgeving op Coolify met een nieuw HTTPS-adres. De huidige productieadressen blijven intact.
- [ ] Activeer automatisch geplande back-ups naar een **andere** opslaglocatie, inclusief media, en controleer herstel buiten GitHub.
- [ ] Importeer een privé-back-up in de testomgeving en vergelijk alle dia's, verborgen PDF-pagina's, tijden en instellingen.
- [ ] Test minimaal één volledige schooldag op de Windows-mini-pc en televisie, inclusief herstart, netwerkstoring en USB-presentatieklikker.
- [ ] Sluit OneDrive-autosynchronisatie aan, of kies bewust om voorlopig via handmatige XLSX-import te werken.
  - De read-only Microsoft Graph XLSX-lezer is inmiddels aanwezig en getest zonder echte accounts. Nog niet aanwezig: Microsoft OAuth-toestemming, versleuteld bewaren/vernieuwen van klanttokens en de automatische synchronisatieplanning.
- [ ] Activeer en test twee-factor-authenticatie voor superadmin; de losse TOTP-hulpmodule is nog niet aangesloten op de login.
- [ ] Beoordeel rechten op bestaande NU.nl-bron en afbeeldingen; de 2.0-Rijksoverheid-bron is **niet exact gelijk** aan het oude nieuws.
- [ ] Controleer beveiliging, AVG, accountuitnodigingen, wachtwoordherstel en eventuele verwerkersovereenkomsten vóór betalende klanten.
- [ ] Maak een verifieerbare back-up van de bestaande `schermloop-private`-repository met de actuele mediabestanden en instellingen.
- [ ] Plan omschakeling en terugval naar het oude presentatieadres; bewijs dat terugschakelen daadwerkelijk werkt.

## Wat betekent 'private repository overnemen'?

De eigenaar heeft toestemming gegeven om `schermloop-private` **later** te vervangen. Die toestemming wordt pas gebruikt wanneer de controles hierboven zijn afgevinkt. Maak eerst een onveranderlijke back-up of Git-tag van de oude branch en controleer of de media bewaard zijn. Overschrijf de bestaande privégegevens of schoolpresentatie niet bij een onvolledige migratie.

De huidige ontwikkelbranch is openbaar. Er zijn geen schoolmedia, klantwachtwoorden of servergeheimen voor de ontwikkeling in deze branch geplaatst.

## Back-up-instructies

Zie [INSTALLATIE-COOLIFY.md](INSTALLATIE-COOLIFY.md) voor het maken, verifiëren en veilig opslaan van een back-up. De scripts zijn ontworpen voor een bestaande Docker Compose-stack en zijn niet automatisch gepland.
