# FloorFlow – Teknisk Granskning


**Syfte:** Faktabaserade förklaringar till mina val i kod, affärsregler, säkerhet, AI-flöde och driftsättning.


<a id="innehall"></a>
## Innehåll

Välj ett område för att hoppa direkt till det, eller fäll ut en del för att hitta en specifik fråga.

| Del | Område | Frågor |
| :---: | --- | :---: |
| **01** | [Arkitektur och kodstruktur](#del-1) | 1–6 |
| **02** | [Datamodell, SQL och affärsregler](#del-2) | 7–15 |
| **03** | [REST-API och frontend](#del-3) | 16–19 |
| **04** | [AI-flödet och SQL-säkerheten](#del-4) | 20–33 |
| **05** | [Belastning, autentisering och nätverk](#del-5) | 34–40 |
| **06** | [Drift, felsökning och kvalitet](#del-6) | 41, 45–48 |

### Alla frågor

<details>
<summary><strong>Del 1 · Arkitektur och kodstruktur</strong> (6 frågor)</summary>

**[Gå till del 1](#del-1)**

- [1. Vad är FloorFlow, och vad ingår inte i projektet?](#fraga-01)
- [2. Varför Node.js 24, Express 5 och vanilla JavaScript i stället för ett större ramverk?](#fraga-02)
- [3. Hur är ansvaren uppdelade utan Onion Architecture?](#fraga-03)
- [4. Varför skickas databasberoendet in i `createApp` och routrarna?](#fraga-04)
- [5. Vad händer från att Node-processen startar tills första HTTP-anropet kan tas emot?](#fraga-05)
- [6. Vad innebär `/health` – och vad bevisar den inte?](#fraga-06)

</details>

<details>
<summary><strong>Del 2 · Datamodell, SQL och affärsregler</strong> (9 frågor)</summary>

**[Gå till del 2](#del-2)**

- [7. Hur hänger databasens fyra tabeller ihop?](#fraga-07)
- [8. Varför finns `unit_price` på både `articles` och `order_items`?](#fraga-08)
- [9. Varför lagras priser och mängder som PostgreSQL `NUMERIC`?](#fraga-09)
- [10. Varför måste varje orderrad avrundas före summering?](#fraga-10)
- [11. Varför räknas inte alla orderstatusar som försäljning?](#fraga-11)
- [12. Hur hanteras en order utan orderrader – och en kund utan order?](#fraga-12)
- [13. Vilka integritetsregler ligger i databasen i stället för bara i C# eller JavaScript?](#fraga-13)
- [14. Varför finns extra index på främmande nycklar?](#fraga-14)
- [15. Vilka siffror ska du kunna använda som oberoende facit?](#fraga-15)

</details>

<details>
<summary><strong>Del 3 · REST-API och frontend</strong> (4 frågor)</summary>

**[Gå till del 3](#del-3)**

- [16. Varför är REST-API:t skrivskyddat och litet?](#fraga-16)
- [17. Hur fungerar ID-valideringen och varför räcker det inte med `Number(id)`?](#fraga-17)
- [18. Hur minskar frontend risken för XSS och felaktig visning?](#fraga-18)
- [19. Varför skickas inte hela chatthistoriken till AI-modellen?](#fraga-19)

</details>

<details>
<summary><strong>Del 4 · AI-flödet och SQL-säkerheten</strong> (14 frågor)</summary>

**[Gå till del 4](#del-4)**

- [20. Följ en AI-fråga hela vägen från webbläsaren till svaret.](#fraga-20)
- [21. Varför används ett strikt JSON-schema för modellens svar?](#fraga-21)
- [22. Varför räcker det inte att bara skriva ”använd SELECT” i systemprompten?](#fraga-22)
- [23. Varför parser vi SQL till ett AST i stället för att leta efter förbjudna ord?](#fraga-23)
- [24. Vilka delar av SQL är avsiktligt förbjudna?](#fraga-24)
- [25. Varför är ett extra statusvillkor i `LEFT JOIN ... ON` ett problem här?](#fraga-25)
- [26. Hur skyddas strängvärden från SQL-injektion i AI-genererade frågor?](#fraga-26)
- [27. Varför finns två olika runtime-användare i PostgreSQL?](#fraga-27)
- [28. Varför används `BEGIN READ ONLY`, `search_path` och tidsgränser ovanpå SQL-valideringen?](#fraga-28)
- [29. Varför kan ett HTTP 200 från AI-boten ändå vara ett fel?](#fraga-29)
- [30. Vad är skillnaden mellan `0.00`, inga resultat och ett 422-fel?](#fraga-30)
- [31. Varför är `reasoning_effort=low` relevant för GPT-5-mini?](#fraga-31)
- [32. Varför bygger vi inte svaret genom ett andra AI-anrop?](#fraga-32)
- [33. Hur ska boten reagera på prompt injection och frågor utanför databasen?](#fraga-33)

</details>

<details>
<summary><strong>Del 5 · Belastning, autentisering och nätverk</strong> (7 frågor)</summary>

**[Gå till del 5](#del-5)**

- [34. Vad begränsar AI-anropen, och varför finns flera nivåer?](#fraga-34)
- [35. Varför sparas AI:s tim- och dygnsräknare men inte klient-IP-listan?](#fraga-35)
- [36. Varför ger systemet ibland 429 trots att det är långt under 100 frågor i timmen?](#fraga-36)
- [37. Varför använder FloorFlow Basic Authentication i stället för full användarinloggning?](#fraga-37)
- [38. Vad gör `TRUST_PROXY`, och varför ska det inte sättas till `true` utan vidare?](#fraga-38)
- [39. Om bara hem-IP:n är tillåten i Azure, hur kan andra ändå nå sidan?](#fraga-39)
- [40. Vad betyder `PGSSLMODE=verify-full`, och varför är det viktigt?](#fraga-40)

</details>

<details>
<summary><strong>Del 6 · Drift, felsökning och kvalitet</strong> (5 frågor)</summary>

**[Gå till del 6](#del-6)**

- [41. Varför hamnade webben på Ubuntu när PostgreSQL och modellen ligger i Azure?](#fraga-41)
- [45. Hur skiljer sig de olika testnivåerna – och vad bevisar de?](#fraga-45)
- [46. Varför kör CI riktig PostgreSQL men inte riktiga Azure OpenAI-anrop?](#fraga-46)
- [47. Vad bör granskas när en AI-fråga ger 422, 502, 503, 504 eller 429?](#fraga-47)
- [48. Vilka är de ärliga begränsningarna om produktionsmognaden?](#fraga-48)

</details>

---

<a id="del-1"></a>

## Del 1 – arkitektur och kodstruktur


<a id="fraga-01"></a>

### 1. Vad är FloorFlow, och vad ingår inte i projektet?


FloorFlow är en liten demonstrationsapplikation för ett golvföretag. Besökaren kan läsa kunder, order och orderrader samt ställa affärsfrågor till en AI-assistent. Applikationen har ett litet **skrivskyddat** REST-API, ett webbaserat gränssnitt och en PostgreSQL-databas med fiktiva data. AI:n kan föreslå SQL men får inte administrera databasen. Projektet saknar avsiktligt exempelvis orderredigering, lagerhantering, fakturering, individuella användarkonton och en generell SQL-konsol. En avgränsad demo är inte ett produktionsfärdigt affärssystem.


<a id="fraga-02"></a>

### 2. Varför Node.js 24, Express 5 och vanilla JavaScript i stället för ett större ramverk?


Applikationens omfattning är liten: tre sidor, ett fåtal GET-endpoints och en AI-route. Express räcker för HTTP, routing och middleware. Vanlig JavaScript i webbläsaren undviker en separat frontend-byggkedja. Det gör kodvägen från användarhandling till SQL lätt att följa. Nackdelen är att vi själva ansvarar för till exempel DOM-uppdateringar, laddningslägen och API-fel, sådant som ett större ramverk kan organisera åt oss. Valet är alltså **proportionerligt mot uppgiften**, inte ett påstående om att React, Blazor eller andra ramverk är fel.


<a id="fraga-03"></a>

### 3. Hur är ansvaren uppdelade utan Onion Architecture?


`server.js` startar processen, läser runtimekonfigurationen, provar databasen och binder HTTP-porten. `app.js` kopplar ihop middleware och routes. `routes/` innehåller API-kontrakt och vanlig databasläsning. `assistant/` innehåller modellen, SQL-valideringen, det separata databaslagret och AI-gränserna. `public/` innehåller gränssnittet. Det är en **praktisk moduluppdelning**, inte en fullständig Onion/Clean Architecture med separata projekt och abstraherade lager. Ansvaren är åtskilda utan att låtsas att projektet har fler arkitekturlager än det faktiskt har.


<a id="fraga-04"></a>

### 4. Varför skickas databasberoendet in i `createApp` och routrarna?


`createApp(database, assistant, options)` och routerfabrikerna tar emot sina beroenden i stället för att själva skapa anslutningar. Det gör att HTTP-tester kan ge dem en kontrollerad databas- eller AI-stub och kontrollera anrop och svar utan en riktig Azure-miljö. Den produktiva poolen skapas separat i `db.js`. Det här är enkel *dependency injection med funktioner*, inte ett DI-ramverk. Vid behov kan implementationen bytas utan att ändra själva HTTP-kontraktet.


<a id="fraga-05"></a>

### 5. Vad händer från att Node-processen startar tills första HTTP-anropet kan tas emot?


`server.js` läser konfigurationen, kör `SELECT 1` mot appens databas, konfigurerar den valfria AI-assistenten, bygger Express-appen och väntar på att `listen` ska lyckas. Om ett steg kastar ett fel loggas ett **fast steg och en sanerad felkategori** i stället för en rå exception som kan innehålla känsliga detaljer. Processen städar upp poolerna och avslutas med felstatus. Därför är en korrekt Docker-build eller en lyckad deployment **inte** samma sak som att appen kan starta.


<a id="fraga-06"></a>

### 6. Vad innebär `/health` – och vad bevisar den inte?


Hälsorouten gör en verklig `SELECT 1` och ger `200` med `database: connected` om det lyckas; annars `503`. Den ligger **bakom preview-autentiseringen**, så det är ingen anonym status-endpoint. Den verifierar att den vanliga app-poolen når PostgreSQL just då. Den bevisar däremot **inte** att AI-modellen kan svara, att den särskilda AI-rollen fungerar eller att en naturlig språkfråga ger ett affärsmässigt korrekt resultat. Det kräver separata tester.

[↑ Till innehåll](#innehall)

---

<a id="del-2"></a>

## Del 2 – datamodell, SQL och affärsregler


<a id="fraga-07"></a>

### 7. Hur hänger databasens fyra tabeller ihop?


`customers` har många `orders`. Varje order har flera `order_items`, och varje orderrad refererar till en `article`. `articles` kan representera material eller arbete, med enhet som `m²`, `pcs` eller `hours`. Utländska nycklar förhindrar föräldralösa orderrader; primärnycklar och unika SKU/ordernummer upprätthåller identitet. Modellen är avsiktligt liten men tillräcklig för verkliga `JOIN`, summeringar och AI-frågor över flera tabeller.


<a id="fraga-08"></a>

### 8. Varför finns `unit_price` på både `articles` och `order_items`?


`articles.unit_price` är ett **aktuellt katalogpris**, medan `order_items.unit_price` är priset som gällde när orderraden skapades. Om katalogpriset ändras ska redan överenskomna order och historisk försäljning inte räknas om. Order-, kund- och försäljningssummeringar använder därför **alltid orderradens pris**. Att använda artikelns aktuella pris i en historisk rapport vore ett affärsfel, även om SQL-frågan tekniskt fungerar.


<a id="fraga-09"></a>

### 9. Varför lagras priser och mängder som PostgreSQL `NUMERIC`?


Priser har `NUMERIC(12,2)` och mängder `NUMERIC(12,3)`. Det möjliggör decimalberäkningar utan JavaScripts vanliga binära flyttalsavrundning. SQL gör multiplikation och avrundning; API:t vidarebefordrar numeriska decimalvärden som **strängar**. Frontend formaterar dessa strängar utan att först göra om dem till `Number`. Därmed bevaras till exempel `101536.50` och `118.500` med den avsedda precisionen.


<a id="fraga-10"></a>

### 10. Varför måste varje orderrad avrundas före summering?


Affärsregeln är `ROUND(quantity * unit_price, 2)` **per rad**, och därefter `SUM`. Fyra rader med mängden `0.500` och priset `0.01` ger på respektive rad avrundat `0.01`, sammanlagt **`0.04`**. Om alla oavrundade multiplikationer summeras först blir summan `0.02000`, alltså `0.02` efter avrundning. Det är en skillnad i regel, inte en kosmetisk formatteringsfråga. Samma princip gäller AI-genererad försäljnings-SQL.


<a id="fraga-11"></a>

### 11. Varför räknas inte alla orderstatusar som försäljning?


En order kan vara `draft`, `pending`, `completed` eller `cancelled`. En **orderdetaljs total** visar värdet på dess orderrader oavsett status. Men **avslutad försäljning och en kunds faktiska spendering** får bara räkna order med `status = 'completed'`. Annars ger utkast, väntande eller annullerade order missvisande försäljningssiffror. Samma ord kan alltså betyda olika urval beroende på om frågan gäller *ordervärde* eller *genomförd försäljning*.


<a id="fraga-12"></a>

### 12. Hur hanteras en order utan orderrader – och en kund utan order?


Orderfrågorna använder `LEFT JOIN` och `COALESCE(SUM(...), 0.00)` för att en existerande order utan rader ska kunna få totalen noll. API:t gör dessutom en separat kontroll av att den begärda kunden eller ordern **finns**. Annars hade en tom resultatlista kunnat betyda antingen ”finns, men inga relaterade rader” eller ”finns inte”. Dessa situationer ska skiljas åt: en okänd kund/order ger `404`, medan en befintlig kund utan order kan ge en tom lista.


<a id="fraga-13"></a>

### 13. Vilka integritetsregler ligger i databasen i stället för bara i C# eller JavaScript?


PostgreSQL har primär- och främmande nycklar, unika ordernummer och SKU:er, begränsade orderstatusar och artikelmåttenheter, samt kontroller för positiva mängder och icke-negativa priser. Schemat avvisar uttryckligen `NaN` där den annars kan ge oväntad numerisk jämförelse i PostgreSQL. `ON DELETE RESTRICT` skyddar refererad data. Även om webbappen en dag får skrivfunktioner ska databasens integritet **inte** enbart förlita sig på frontendvalidering.


<a id="fraga-14"></a>

### 14. Varför finns extra index på främmande nycklar?


PostgreSQL skapar index automatiskt för primärnycklar och unika begränsningar, men **inte automatiskt för vanliga främmande nycklar**. Därför finns index på `orders.customer_id`, `order_items.order_id` och `order_items.article_id`. De passar de vanliga läsflödena, som att hämta en kunds order och en orders rader. Index ska ändå motiveras av faktiska frågemönster; en liten demo är inte bevis för alla framtida prestandabehov.


<a id="fraga-15"></a>

### 15. Vilka siffror ska du kunna använda som oberoende facit?


Den dokumenterade demoseeden innehåller **5 kunder, 12 order, 12 artiklar och 48 orderrader**, varav **8 avslutade order**. Avslutad försäljning är **`285415.00 SEK`** exklusive moms. Maple Property Group har **`101536.50 SEK`**, Harbor Office Studio är störst med **`109000.00 SEK`**, och genomförd försäljning av `OAK-ENG-14` är **`118.500 m²`**. Dessa värden kommer från testdata och verifierings-SQL; de får **inte hårdkodas som AI-svar**. Förändras seeden måste facit räknas om.

[↑ Till innehåll](#innehall)

---

<a id="del-3"></a>

## Del 3 – REST-API och frontend


<a id="fraga-16"></a>

### 16. Varför är REST-API:t skrivskyddat och litet?


Vanliga API-routes är `GET /api/customers`, `GET /api/customers/:id`, `GET /api/customers/:id/orders`, `GET /api/orders/:id` och `GET /api/orders/:id/items`. De utför explicit definierade `SELECT`-frågor; det finns inga POST-, PUT- eller DELETE-routes för affärsdata. AI-frågan använder tekniskt sett `POST /api/assistant/chat` för att ta emot ett JSON-meddelande, men den får fortfarande bara läsa data. Att begränsa ytan gör både rättigheter och tester enklare att granska.


<a id="fraga-17"></a>

### 17. Hur fungerar ID-valideringen och varför räcker det inte med `Number(id)`?


`validateId` kräver en sträng som enbart består av siffror, och kontrollerar sedan att den motsvarar ett heltal mellan 1 och 2 147 483 647. Därmed stoppas till exempel `-1`, `1.5`, `1e3` och textvärden innan de når SQL-frågan. Ett **ogiltigt ID** ger `400`, medan ett **giltigt ID som saknas** ger `404`. SQL använder dessutom `$1` och parametrar i stället för att sammanfoga URL-värden till SQL-strängar.


<a id="fraga-18"></a>

### 18. Hur minskar frontend risken för XSS och felaktig visning?


UI-koden sätter data från API och AI via `textContent` och DOM-metoder, inte genom att stoppa in otestade strängar i `innerHTML`. SQL visas i ett separat, hopfällbart `<details>`-fält som **text**, inte som körbar kod. `api.js` har tydlig felhantering; om en gateway ersätter ett AI-fel med en HTML-sida ska den inte renderas som ett chattmeddelande. Backend har dessutom CSP, `nosniff` och andra säkerhetsheaders. Det är lager av skydd, inte en ursäkt att lita på modellens utdata.


<a id="fraga-19"></a>

### 19. Varför skickas inte hela chatthistoriken till AI-modellen?


Varje fråga är **fristående**. Webbläsaren kan visa en liten lokal historik för användaren, men `generateSql` skickar bara systeminstruktionen och den aktuella frågan till modellen. Därmed får vi en enklare uppgift: översätt **en affärsfråga** till **en SQL-fråga**. Följdfrågor som ”och förra månaden då?” är inte garanterat meningsfulla utan kontext. Det är ett medvetet scope-val och bör inte beskrivas som en minnesförande konversationsagent.

[↑ Till innehåll](#innehall)

---

<a id="del-4"></a>

## Del 4 – AI-flödet och SQL-säkerheten


<a id="fraga-20"></a>

### 20. Följ en AI-fråga hela vägen från webbläsaren till svaret.


`assistant.js` skickar `{ message }` till `POST /api/assistant/chat`. Routen verifierar format, gränser och kapacitet. `assistant.js` i serverkoden anropar `generateSql`, som ber Azure-modellen lämna ett strikt JSON-objekt med `sql`. Om modellen svarar `null` returneras en förklaring om att schemat inte kan besvara frågan. Annars kör `executeReadQuery` en **validerad och omgenererad** SELECT med en separat läsroll. `buildAnswer` bygger svarstext och resultattabell från faktiska databasvärden. **AI:n producerar frågeförslaget; databasen beräknar siffrorna.**


<a id="fraga-21"></a>

### 21. Varför används ett strikt JSON-schema för modellens svar?


Modellen instrueras att returnera exakt ett objekt med egenskapen `sql`, som är antingen en sträng eller `null`. Det underlättar maskinell kontroll och undviker att applikationen försöker plocka SQL ur löptext, markdown eller flera förslag. Koden kontrollerar dessutom `finish_reason`, antal svarsalternativ, vägran, oväntade verktygsanrop, JSON-parsning och längd. **Strukturerat svar är inte samma sak som säker SQL**: SQL-strängen måste fortfarande passera den egna validatorn.


<a id="fraga-22"></a>

### 22. Varför räcker det inte att bara skriva ”använd SELECT” i systemprompten?


En språkmodell kan missförstå instruktioner, producera otillåten SQL eller bli påverkad av en användares försök att ändra reglerna. Den verkliga gränsen ligger därför i **programkod och databasbehörigheter**, inte i prompten. `validateSql` avvisar konstruktioner som inte finns i allowlisten; `floorflow_ai` saknar skrivrättigheter; exekveringen sker i en lästransaktion. Prompten förbättrar sannolikheten för ett användbart förslag, men ska aldrig ensam avgöra vad som får köras.


<a id="fraga-23"></a>

### 23. Varför parser vi SQL till ett AST i stället för att leta efter förbjudna ord?


SQL har alias, parenteser, kommentarer, strängar, funktioner och många sätt att uttrycka liknande operationer. En regex som letar efter `DELETE` eller kontrollerar att texten börjar med `SELECT` kan både missa farliga fall och stoppa giltig text. `pgsql-ast-parser` bygger i stället ett syntaxträd som kontrolleras nod för nod: tillåtna tabeller, relationer, uttryck, funktioner, kolumner och storleksgränser. Om syntaxträdet innehåller något okänt **avvisas frågan** (*fail closed*).


<a id="fraga-24"></a>

### 24. Vilka delar av SQL är avsiktligt förbjudna?


Bara en `SELECT` över de fyra godkända affärstabellerna accepteras. Varje tabell får förekomma högst en gång. Kopplingar måste följa de definierade främmande nycklarna. CTE:er, subqueries, UNION, window functions, systemkataloger, flera statements, godtyckliga funktioner, `SELECT *` och skrivoperationer stöds inte. Tillåtna funktioner är bland annat `SUM`, `COUNT`, `AVG`, `COALESCE`, `LOWER`, `UPPER` och en **begränsad** `ROUND(..., 2)`. Validatorn sätter också gränser för uttrycksdjup, antal noder, kolumner och resultatstorlek. Att PostgreSQL tillåter något gör det alltså inte automatiskt tillåtet i FloorFlow.


<a id="fraga-25"></a>

### 25. Varför är ett extra statusvillkor i `LEFT JOIN ... ON` ett problem här?


Validatorn kräver att `JOIN ... ON` enbart består av en godkänd **FK-likhet**, exempelvis `oi.order_id = o.id`. En SQL som också lägger `AND o.status = 'completed'` inne i `ON` avvisas, trots att den kan vara giltig PostgreSQL. Det var den verifierade felmekanismen bakom en omformulerad fråga om en obefintlig kund. Dessutom kan placeringen av villkoret påverka semantiken i en `LEFT JOIN`. Den säkra vägen i projektet är att **styra modellen mot de SQL-former validatorn redan stöder** och testa resultatet, inte godtyckligt utöka tillåten syntax.


<a id="fraga-26"></a>

### 26. Hur skyddas strängvärden från SQL-injektion i AI-genererade frågor?


Efter godkänd AST-validering bygger koden om SQL med `toSql.statement`. Strängliteraler ersätts samtidigt med parametrar som `$1` och separata `values`. Det är den **omgenererade SQL:n**, inte modellens ursprungliga text, som skickas till PostgreSQL via extended query protocol. En kund som heter något med apostrof behöver därmed inte läggas in som handskriven SQL-escape. Parametrar är viktiga, men de ersätter inte AST-valideringen: även en helt parameteriserad fråga kan vara otillåten eller affärsmässigt fel.


<a id="fraga-27"></a>

### 27. Varför finns två olika runtime-användare i PostgreSQL?


`floorflow_app` används för de fördefinierade REST-frågorna. `floorflow_ai` används bara för SQL som kommer från modellen och har en separat, begränsad pool. Båda är skrivskyddade i den aktuella demomiljön, men AI-rollen behandlas extra strikt eftersom frågans struktur kommer från ett opålitligt modellresultat. Innan en AI-fråga körs kontrolleras den faktiska rollen och dess behörigheter: den får inte vara superuser, skapa databaser eller roller, kringgå RLS eller ha skrivprivilegier på affärstabellerna. Även om validatorn hade en bugg ska databaskontot inte kunna ändra data.


<a id="fraga-28"></a>

### 28. Varför används `BEGIN READ ONLY`, `search_path` och tidsgränser ovanpå SQL-valideringen?


Det är **försvar på flera nivåer**. AI-frågan körs i en read-only-transaktion; `search_path` sätts till `pg_catalog` så att oväntade objekt i `public` inte fångas upp som implicita funktioner; servern begränsar bland annat statement time, lock wait och arbetsminne. Varje körning använder en kontrollerad databasanslutning och rullar tillbaka transaktionen. Resultat begränsas till högst 50 visade rader och 32 000 JSON-byte. Inget enskilt skydd ersätter de andra.


<a id="fraga-29"></a>

### 29. Varför kan ett HTTP 200 från AI-boten ändå vara ett fel?


HTTP 200 betyder att applikationen kunde behandla förfrågan och returnera data – **inte att den genererade SQL:n uttrycker rätt affärsfråga**. Under de verkliga testerna gav `maple property group` i gemener först ett felaktigt nollbelopp på grund av skiftlägeskänslig namnmatchning. En naturlig fråga om `engineered oak flooring` missade artikeln när dess fullständiga namn även innehöll `14 mm`. Detta är farligare än ett tydligt 422-fel eftersom svaret kan se trovärdigt ut. Jämför därför **både SQL:s avsikt och de returnerade siffrorna** med oberoende facit.


<a id="fraga-30"></a>

### 30. Vad är skillnaden mellan `0.00`, inga resultat och ett 422-fel?


Ett aggregerat `SUM` med lämplig `COALESCE` kan ge en enda rad med `0.00`, vilket passar en fråga om hur mycket en obefintlig namngiven kund har spenderat. En fråga med `GROUP BY` på kund kan i stället returnera **noll rader** när kunden inte finns; det ska inte feltolkas som en påhittad kund. Ett `422` betyder i FloorFlow att genererad SQL inte uppfyller allowlisten eller att resultatet har en otillåten form/storlek. Det är alltså ett **verifieringsfel**, inte ett matematiskt nollresultat. Den tidigare missing-customer-buggen handlade om modellens SQL-form, inte om att PostgreSQL inte kan räkna noll.


<a id="fraga-31"></a>

### 31. Varför är `reasoning_effort=low` relevant för GPT-5-mini?


Ett reproducerat modelltest slutade med `finish_reason=length`: alla **1 200 completion-tokens** gick åt till resonemang och inget SQL-innehåll hann komma tillbaka. FloorFlow ska då avvisa resultatet med ett säkert modellfel, inte behandla en tom respons som SQL. I det inspekterade arkivet anges explicit `reasoning_effort: 'low'` tillsammans med `max_completion_tokens: 1200` och en timeout på 20 sekunder. Detta förbättrade riktade omtester men garanterar inte att alla framtida frågor får ett fullständigt svar. **Reasoning-tokens räknas mot completion-budgeten.**


<a id="fraga-32"></a>

### 32. Varför bygger vi inte svaret genom ett andra AI-anrop?


`buildAnswer` använder kolumnnamn, värden och antal rader från PostgreSQL för att skapa en förutsägbar text. För ett belopp får det en relevant etikett och enheten SEK exklusive moms; flera rader kan visas i tabell. Ett andra generativt steg skulle kunna introducera nya påhittade siffror, kostnad och osäkerhet. Avsaknaden av ett andra AI-anrop är därför ett medvetet val för **spårbarhet och förutsägbarhet**, även om de automatiskt byggda svarstexterna kan låta lite mekaniska.


<a id="fraga-33"></a>

### 33. Hur ska boten reagera på prompt injection och frågor utanför databasen?


En fråga som ber modellen radera kunder, läsa lösenord från systemkataloger eller ignorera reglerna ska inte få körbar skriv-SQL. En väderfråga eller fråga om lagersaldo ska normalt ge `sql: null` eftersom schemat saknar den informationen. Säkerheten får dock **inte** bygga på att modellen alltid vägrar: validatorn stoppar otillåten struktur och AI-databasanvändaren har inga skrivrättigheter. En fråga som ber om felaktig affärstolkning, till exempel att räkna pending-order som avslutad försäljning, måste också granskas semantiskt även om SQL:n är strukturellt säker.

[↑ Till innehåll](#innehall)

---

<a id="del-5"></a>

## Del 5 – belastning, autentisering och nätverk


<a id="fraga-34"></a>

### 34. Vad begränsar AI-anropen, och varför finns flera nivåer?


Den inspekterade versionen begränsar **giltiga försök till 12 per klient-IP under 60 sekunder**. En beständig budget tillåter **100 modellstarter per UTC-timme** och **200 per UTC-dygn**. En separat kö tillåter **två samtidiga arbeten**, högst **fyra väntande**, och väntan i högst **fem sekunder**. Azure-modellens egna kvoter rapporterades som 10 requests/minut och 10 000 tokens/minut och kan fortfarande orsaka `429`. Begränsningarna skyddar kostnad, pooler och användbarhet; de är **inte ett absolut faktureringstak**.


<a id="fraga-35"></a>

### 35. Varför sparas AI:s tim- och dygnsräknare men inte klient-IP-listan?


`usage-budget.js` sparar en liten JSON-fil med UTC-fönster och sammanlagda antal, **inte frågor, kunddata eller IP-adresser**. Filen uppdateras före modellstart så att en krasch hellre överräknar ett anrop än ger ett gratis försök. En korrupt eller otillgänglig budgetfil leder till ett kontrollerat fel snarare än ett tyst återställt kostnadsskydd. Däremot ligger per-IP-gränsen och kön i processminnet. Denna utformning förutsätter **en Node-instans**; flera repliker skulle behöva gemensam lagring och samordning.


<a id="fraga-36"></a>

### 36. Varför ger systemet ibland 429 trots att det är långt under 100 frågor i timmen?


Flera separata gränser kan slå till: 12 försök/minut från samma klient-IP, två aktiva AI-arbeten, full väntkö, provider-429 eller Azure-modellens egna RPM/TPM-kvoter. Två testare bakom samma företags-NAT kan dela IP-kvot. HTTP-svaret ska använda `Retry-After` när klienten bör vänta. En `429` är alltså inte automatiskt en bugg; granska **vilken spärr som slog till** och om användaren får en rimlig återkoppling.


<a id="fraga-37"></a>

### 37. Varför använder FloorFlow Basic Authentication i stället för full användarinloggning?


Det här är en **begränsad preview för en rekryteringsdemo**, inte en multi-user-tjänst. Ett delat användarnamn och lösenord över HTTPS skyddar sidor, API, AI-route och `/health`. Middleware jämför ett hashat värde med `timingSafeEqual`, kräver kanonisk Basic-kodning och undviker att logga hemligheter. Produktionsmiljön kräver previewuppgifter och HTTPS. Nackdelarna är tydliga: ingen individuell behörighet, ingen personlig revision eller enkel återkallelse för en enda testare. För bredare publik användning krävs en riktig identitetslösning.


<a id="fraga-38"></a>

### 38. Vad gör `TRUST_PROXY`, och varför ska det inte sättas till `true` utan vidare?


Cloudflare avslutar besökarens HTTPS-anslutning, medan den lokala länken från tunneln till Node går via HTTP. Express måste därför kunna förstå vilka vidarebefordrade headers som kommer från en **betrodd proxy**, annars kan appen felaktigt tro att ett legitimt HTTPS-anrop är HTTP och returnera `426`. Men om vem som helst får påverka `X-Forwarded-*` kan en angripare manipulera uppfattad klient-IP eller protokoll, vilket även påverkar rate limiting. Den dokumenterade Ubuntu-miljön betror uttryckligen **Docker-gatewayn `172.29.44.1` och loopback `127.0.0.1`**, efter riktiga proxyprober. Adresserna är miljöspecifika och måste kontrolleras efter nätverksändringar.


<a id="fraga-39"></a>

### 39. Om bara hem-IP:n är tillåten i Azure, hur kan andra ändå nå sidan?


Besökaren ansluter **inte direkt till Azure PostgreSQL eller Azure OpenAI**. Användaren öppnar `floorflow.marcuslehm.se` via Cloudflare Tunnel. FloorFlow-processen på Ubuntu gör sedan utgående TLS-/HTTPS-anrop till Azure. Azure-reglerna begränsar **serverns** utgående publika IP, inte användarens anslutning. Om internetleverantören byter hemmets publika IP kan anslutningen från Ubuntu till båda Azure-tjänsterna sluta fungera, trots att själva webbplatsen fortfarande går att öppna.


<a id="fraga-40"></a>

### 40. Vad betyder `PGSSLMODE=verify-full`, och varför är det viktigt?


En krypterad anslutning räcker inte om klienten pratar med fel server. `verify-full` kräver både en giltig certifikatkedja och att certifikatet stämmer med serverns **DNS-namn**. Det minskar risken att ansluta till en falsk endpoint. Båda runtime-poolerna ska använda verifierad TLS mot Azure PostgreSQL. Om anslutningen misslyckas är rätt felsökningsväg att kontrollera DNS, utgående nät, brandvägg, servernamn och certifikat – **inte** att stänga av certifikatkontrollen.

[↑ Till innehåll](#innehall)

---

<a id="del-6"></a>

## Del 6 – drift, felsökning och kvalitet


<a id="fraga-41"></a>

### 41. Varför hamnade webben på Ubuntu när PostgreSQL och modellen ligger i Azure?


Den ursprungliga planen var Azure App Service. Gratisplanen F1 rapporterade ihållande `QuotaExceeded` och `403.67 Site Disabled`; även Kudu/OneDeploy blockerades. Försök att gå till B1 stoppades av kapacitets- respektive prenumerationskvotbegränsningar. Det var **separat från ett tidigare Node-startfel**, så en grön CI-build bevisade aldrig att den publika sidan fungerade. Ubuntu-VM:n hade redan Docker och en etablerad Cloudflare Tunnel. Därför flyttades **bara webb-runtime**, medan Azure PostgreSQL och den riktiga GPT-5-mini-deploymenten behölls. Det är en pragmatisk workaround, **inte** full Azure-hosting.


<a id="fraga-45"></a>

### 45. Hur skiljer sig de olika testnivåerna – och vad bevisar de?


Enhetstester kan bevisa att en parserregel eller formatterare fungerar för bestämda fall. Integrationstester med PostgreSQL bevisar databasbeteende i en kontrollerad miljö. En lyckad Docker-build visar att paketet går att bygga. En publik HTTP-kontroll visar att Cloudflare och appen svarar. Men bara **riktiga AI-frågor med oberoende facit** visar om modellens SQL tolkar affärsfrågorna korrekt. Historiskt gav ett brett test 13/20 lyckade frågor; senare riktade omtester och release 09-loggen rapporterar förbättringar. De resultaten har olika räckvidd och får inte presenteras som ett enda generellt ”AI:n fungerar alltid”.


<a id="fraga-46"></a>

### 46. Varför kör CI riktig PostgreSQL men inte riktiga Azure OpenAI-anrop?


GitHub Actions startar PostgreSQL i Docker, skapar tillfälliga testuppgifter, installerar låsta beroenden, sätter upp den begränsade AI-rollen och kör syntaxkontroll, tester och beroendegranskning. På så vis testas riktiga SQL- och rollbeteenden utan att CI behöver produktionshemligheter eller kan förbruka AI-kredit vid varje push. Modellsvaren simuleras i de automatiska enhetstesterna. **Riktig modellacceptans är ett separat, budgeterat testspår** som ska journalföras och jämföras med affärsfacit före ett relevant releasebeslut.


<a id="fraga-47"></a>

### 47. Vad bör granskas när en AI-fråga ger 422, 502, 503, 504 eller 429?


`422` pekar ofta på **otillåten genererad SQL** eller otillåten resultatstorlek/typ. `502` betyder att modellens svar var oanvändbart, avbrutet eller i fel format; en gateway kan också svara med en egen HTML-felsida. `503` kan handla om en saknad AI-konfiguration, providerfel eller databasens säkerhets-/anslutningskontroller. `504` gäller timeout. `429` hör ihop med klientgräns, kö/budget eller providerkvot. Granska om svaret faktiskt kommer från Node eller Cloudflare, vilka **sanerade metadata** som finns och om databasen nåddes.


<a id="fraga-48"></a>

### 48. Vilka är de ärliga begränsningarna om produktionsmognaden?


Webb-runtime kör hemma och är beroende av Windows, Hyper-V, Ubuntu, Docker, Cloudflare och hemmets internetförbindelse. Lösningen har ingen dokumenterad moln-SLA. Demoautentiseringen bygger på delade credentials, inte individuella användare. AI-svar kan fortfarande vara affärsmässigt fel trots HTTP 200, och providerkvoter eller timeout kan ge tillfälliga fel. Skrivskydd, strikta SQL-regler och provade seedfall är starka säkerhets- och kvalitetsåtgärder men **ingen garanti för allmän AI-korrekthet**.

[↑ Till innehåll](#innehall)

---