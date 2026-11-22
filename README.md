# Sito vetrina Lionel Milano

Sito statico generato dal catalogo **pubblico** del negozio Shopify. Non serve nessun token.

- I prodotti **senza foto** vengono esclusi sempre.
- I prodotti **esauriti** vengono esclusi se `excludeSoldOut` è `true` in `site.config.json`.
- Il carrello resta nel browser del visitatore. "Procedi al checkout" apre il **checkout ufficiale Shopify** tramite cart permalink (`/cart/VARIANTE:QTA,...`), quindi da questo sito non passano né pagamenti né dati personali.
- La diretta / live shopping non fa parte di questo sito: è nel repo `lionel-boutique`.

## Comandi

```bash
npm run build    # scarica il catalogo e genera dist/
npm run serve    # anteprima su http://localhost:4173
```

## Configurazione: `site.config.json`

| Campo | Cosa fa |
|---|---|
| `shopifyDomain` | Dominio `.myshopify.com` da cui si legge il catalogo |
| `storeUrl` | Dominio del negozio Shopify. Si usa per checkout, account e policy |
| `siteUrl` | URL pubblico del sito, una volta deciso. Attiva canonical e sitemap |
| `vatNumber`, `contactEmail`, `social.*` | Se restano vuoti, la voce non compare nel sito |
| `excludeSoldOut` | Esclude i prodotti senza alcuna taglia disponibile |

## Pubblicazione

`dist/` è una cartella statica, quindi va bene qualunque hosting statico: Netlify, Cloudflare Pages, Vercel, GitHub Pages.

- Build: GitHub Action `.github/workflows/deploy.yml` (a ogni push e ogni notte)
- Hosting: GitHub Pages, dominio lionelmilano.com
- Node 20 o superiore

Il catalogo viene "fotografato" al momento della build. Per tenerlo allineato con Shopify:
- rifai la build quando cambiano i prodotti, oppure
- programma una build periodica (build hook dell'hosting o GitHub Action giornaliera).

La disponibilità reale delle taglie viene comunque verificata da Shopify al checkout.

## Prerequisito

Il dominio indicato in `storeUrl` deve puntare al negozio Shopify, altrimenti il checkout non si apre.
