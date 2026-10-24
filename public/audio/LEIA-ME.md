# Música de fundo do Quadro Espelho 3D

`quadro-3d-ambiente.mp3` — **"Elegant Piano"**, de **leberch**, obtida no Pixabay em 24/10/2026:
https://pixabay.com/music/modern-classical-elegant-piano-262898/

- Licença: **Pixabay Content License** (https://pixabay.com/service/license-summary/): uso
  comercial permitido, sem crédito obrigatório, sem pagamento. Não pode ser revendida nem
  redistribuída como faixa avulsa — só como parte de um produto (aqui, a trilha do painel).
- Composição humana (a página não traz a marca "AI generated"). A faixa é registrada no
  Content ID do YouTube: num vídeo gravado da tela com a música, o YouTube pode exibir
  reivindicação automática; no painel isso não importa.
- Original: 2:22, 256 kbps, gravada baixa (média -28 dB). Aqui: normalizada a -16 LUFS (loudnorm), 128 kbps, fade de 1,5 s na entrada e 2,5 s no fim,
  para o loop não dar estalo (`ffmpeg -af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=1.5,afade=t=out:st=139.3:d=2.5"`).
- Onde toca: `src/components/torre-3d.tsx` (`MUSICA_URL`, `MUSICA_VOLUME`); entra ao abrir a
  tela cheia, botão de alto-falante liga/desliga, preferência em `localStorage.quadro3d_musica`.

Para trocar a faixa: substituir o arquivo (mesmo nome) e atualizar este LEIA-ME com a fonte e a licença.
