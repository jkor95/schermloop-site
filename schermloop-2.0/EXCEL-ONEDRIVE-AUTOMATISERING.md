# Excel- en OneDrive-mededelingen per SchermLoop-scherm

SchermLoop 2.0 ondersteunt twee manieren van importeren:

**Handmatig:** de bedrijfsbeheerder uploadt een XLSX met de kolommen `Titel`, `Tekst`, `Seconden` en `Tonen`. Dit werkt zonder Microsoft-aanmelding.

**Automatisch via een webhook:** de bedrijfsbeheerder maakt bij het juiste scherm een unieke synchronisatiesleutel. Een eigen Microsoft Power Automate-flow kan de Excel-rijen uit OneDrive uitlezen en naar dat SchermLoop-scherm sturen. Dit is **niet** hetzelfde als rechtstreeks aanmelden bij Microsoft binnen SchermLoop; daarvoor is nog OAuth-integratie nodig.

## Koppeling maken

1. Log in als bedrijfsbeheerder, kies het gewenste scherm en open **Automatisch bijwerken vanuit Excel / Power Automate**.
2. Kies **Nieuwe synchronisatiesleutel maken**. Bewaar het getoonde endpoint en de sleutel direct op een veilige plek. De sleutel wordt in SchermLoop niet in leesbare vorm bewaard.
3. Maak in Power Automate een geschikte flow: terugkerende trigger → Excel Online (Business), `List rows present in a table` → transformeer de rijen naar de velden uit het voorbeeld hieronder → een HTTP-aanroep naar het getoonde SchermLoop-endpoint. Gebruik in de HTTP-header `Authorization: Bearer <de-getoonde-sleutel>` en `Content-Type: application/json`.
4. Verzend de rijen met methode **POST** als JSON:

```json
{
  "items": [
    {
      "Titel": "Open Leer Centrum",
      "Tekst": "Tijdens de toetsweek graag stilte.",
      "Seconden": 20,
      "Tonen": "Ja"
    },
    {
      "Titel": "Oude melding",
      "Tekst": "Niet meer tonen",
      "Seconden": 10,
      "Tonen": "Nee"
    }
  ]
}
```

Alleen actieve mededelingen worden op dat scherm opgeslagen. De vorige Excel-synchronisatie wordt vervangen; handmatig toegevoegde dia's worden niet aangepast. Maximaal 50 rijen per verzoek. Een verzoek zonder actieve mededelingen wordt uit voorzorg geweigerd, tenzij `allow_empty: true` expliciet is opgegeven.

**Let op:** Power Automate-functies en HTTP-acties kunnen afhankelijk zijn van het Microsoft-account, licenties en organisatiebeleid. Voor klanten zonder passende mogelijkheden blijft de handmatige XLSX-import beschikbaar.

## Beveiliging

- Eén synchronisatiesleutel per scherm; de database bewaart uitsluitend een SHA-256-hash.
- Een nieuw gegenereerde sleutel maakt de vorige onmiddellijk ongeldig.
- De beheerder kan de koppeling ieder moment uitschakelen.
- Het HTTP-endpoint is alleen bedoeld voor HTTPS en krijgt de sleutel via de Authorization-header, nooit in een URL.
- Sleutels horen niet in een openbare GitHub-repository, logbestanden, PowerPoint of chatbericht.
- De geplande Microsoft-flow blijft onder beheer van de klant.
- De gekoppelde Excel-functie moet op de eigen server getest worden voordat zakelijke klanten hiervan afhankelijk zijn.

## Rechtstreekse OneDrive-koppeling

De **alleen-lezen Microsoft Graph-adapter** `onedrive-reader.js` is voorbereid, maar aanmelden met Microsoft, toestemming geven en automatisch verversen van toegang zijn nog niet aangesloten. Markeer de rechtstreekse OneDrive-koppeling daarom niet als voltooid.
