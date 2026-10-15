# Imperium

Landing da Imperium, comunidade e loja de Volleyball Legends no Discord. Publicada em [imperiumblox.shop](https://imperiumblox.shop/).

Site estático, sem build e sem dependências.

## Estrutura

```
index.html              marcação, metatags e ícones SVG
assets/css/styles.css   estilos
assets/js/main.js       interações (header ao rolar, lightbox, copiar convite, barra mobile)
prova-1..5.webp         prints de feedback do Discord
vercel.json             cleanUrls e cache dos arquivos estáticos
```

## Rodar localmente

Os caminhos são absolutos (`/assets/...`, `/prova-1.webp`), então sirva a pasta por HTTP em vez de abrir o arquivo direto:

```bash
npx serve .
```

ou

```bash
python -m http.server 8000
```

## Deploy

Na Vercel, importe o repositório com o preset **Other**, sem comando de build e com a raiz como diretório de saída.

O convite do Discord (`https://discord.gg/B7EYXPQndC`) aparece no `index.html` e no `assets/js/main.js` (botão de copiar). Se mudar, troque nos dois.
