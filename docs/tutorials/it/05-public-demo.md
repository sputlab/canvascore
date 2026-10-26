# 5. Metti online una demo pubblica

Una demo permette alle persone di provare il vero editor senza installare nulla. CanvasCore ha una **modalità demo**: i visitatori entrano con un account condiviso, possono creare qualche pagina ed elemento, e il sito **torna da solo al punto di partenza ogni pochi minuti**. Non servono né SSH né un cron job, quindi funziona su un normale hosting condiviso.

Cosa fa la modalità demo:

- mostra i dati di accesso della demo nella schermata di accesso, e nell'editor un conto alla rovescia fino al prossimo ripristino;
- blocca il cambio password e i caricamenti, ferma le email dei moduli e chiede ai motori di ricerca di non indicizzarla;
- limita quante nuove pagine ed elementi può creare un visitatore e (di base) **non permette ai visitatori di pubblicare**, così niente di quello che scrivono diventa pubblico sul tuo indirizzo;
- disattiva aggiornamenti, pacchetti, importazione, integrazioni e libreria dei modelli.

## 1. Installa una copia separata

Usa un sottodominio dedicato, per esempio `demo.your-domain`, con una sua cartella: installa lì CanvasCore come nel [tutorial 1](01-install.md). **Non** trasformare un sito vero in una demo.

## 2. Parti dalla demo già pronta (facoltativo)

Il repository contiene un sito demo finito, *Lumen Studio*, in inglese e in italiano: `demo/demo-baseline.zip`. Nell'editor della demo apri **Amministrazione › Backup**, scegli **Scegli un file di backup…** e ripristinalo. Ottieni pagine, un blog, un menu, un popup, due lingue e immagini. Oppure costruisci un sito tuo, poi prosegui dal passo 3.

(Il file è creato da `scripts/demo-build.php`; si esegue su un computer di sviluppo, non sull'hosting.)

## 3. Attiva la modalità demo

Con il file manager, crea un file **`demo.json`** nella cartella dei dati (quella che contiene `canvascore.sqlite`; la pagina di installazione ti ha detto dov'è), con:

```json
{ "username": "demo", "password": "canvasdemo", "resetMinutes": 10, "maxNewPages": 5, "maxNewItems": 5 }
```

- `username` / `password`: i dati di accesso mostrati ai visitatori (almeno 8 caratteri).
- `resetMinutes`: ogni quanto si ripristina la demo (da 1 a 60; 10 va bene).
- `maxNewPages`, `maxNewItems`: quante pagine ed elementi può creare un visitatore tra un ripristino e l'altro.
- `publish`: `true` permette ai visitatori di pubblicare (disattivato di base).
- `resetToken`: facoltativo, vedi il passo 6.

Ricarica l'editor: **Amministrazione › Backup** ora ha una scheda **Demo pubblica**.

## 4. Crea l'account dei visitatori e il punto di partenza

In **Backup › Demo pubblica**:

1. **Crea l'account dei visitatori** crea l'account editor `demo` con la password di `demo.json`, già scelta (i visitatori non possono cambiarla).
2. Prepara il sito esattamente come vuoi che lo trovino i visitatori, poi premi **Tieni questo sito come punto di partenza**. Questo salva un backup a cui la demo viene riportata.

## 5. Si ripristina da sola

Da questo momento, la prima visita di ogni periodo (per esempio la prima dopo ogni scatto dei 10 minuti) riporta il sito al punto di partenza e lo pubblica di nuovo, qualunque cosa abbiano fatto i visitatori. La scheda Demo pubblica mostra l'ultimo ripristino, e **Ripristina ora** ne forza uno. Non devi programmare nulla.

Per cambiare la demo, disattivala rimuovendo `demo.json` (o rinominandolo), modifica il sito come amministratore, salva un nuovo punto di partenza e riattivala.

## 6. Facoltativo: un ripristino anche quando non arriva nessuno

Una demo senza visitatori non ha bisogno di essere ripristinata, perché nessuno l'ha cambiata. Se lo vuoi comunque, imposta `"resetToken": "a-long-random-string-16-chars-or-more"` in `demo.json` e fai chiamare da un servizio cron gratuito (o dal cron del pannello):

```
https://demo.your-domain/canvascore-admin/demo-reset.php?token=a-long-random-string-16-chars-or-more
```

Senza un `resetToken` quell'indirizzo non esiste.

## Buono a sapersi

- Le pagine pubblicate della demo sono la *vista del sito* per i visitatori, non delle loro modifiche: i visitatori vedono in anteprima i loro cambiamenti nell'editor, e solo tu pubblichi.
- I visitatori possono comunque scrivere testo e vederlo nell'editor; tieni `maxNewPages` basso e il ripristino frequente.
- Metti un link dal tuo sito principale alla demo e spiega cos'è: "Prova l'editor: demo / canvasdemo".
