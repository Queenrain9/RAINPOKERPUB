export class PreviewScene extends Phaser.Scene {
  constructor() {
    super("PreviewScene");
  }

  create() {
    const { width, height } = this.scale;
    const tile = Math.max(26, Math.min(42, Math.floor(width / 10)));
    const cols = Math.ceil(width / tile) + 2;
    const rows = Math.ceil(height / tile) + 2;
    const g = this.add.graphics();

    // Floor grid rendered by the same game renderer family that will later host the live map.
    g.fillStyle(0x2a211a, 1);
    g.fillRect(0, 0, width, height);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const px = x * tile;
        const py = y * tile;
        const even = (x + y) % 2 === 0;
        g.fillStyle(even ? 0x33281f : 0x30251d, 1);
        g.fillRect(px, py, tile - 1, tile - 1);
      }
    }

    const roomW = Math.min(width - 34, tile * 9);
    const roomH = Math.min(height * 0.58, tile * 10);
    const roomX = (width - roomW) / 2;
    const roomY = Math.max(44, height * 0.08);

    g.lineStyle(7, 0x6c4930, 1);
    g.strokeRoundedRect(roomX, roomY, roomW, roomH, 12);

    // A real renderer preview: table footprint, seats, dealer and lounge are drawn on the same grid.
    const tableW = tile * 3;
    const tableH = tile * 1.25;
    const tx = roomX + (roomW - tableW) / 2;
    const ty = roomY + roomH * 0.34;

    g.fillStyle(0x164f42, 1);
    g.fillRoundedRect(tx, ty, tableW, tableH, tableH / 2);
    g.lineStyle(3, 0xb17b3e, 1);
    g.strokeRoundedRect(tx, ty, tableW, tableH, tableH / 2);

    const seatPoints = [
      [tx + tile * .25, ty - tile * .35],
      [tx + tile * 1.5, ty - tile * .52],
      [tx + tile * 2.75, ty - tile * .35],
      [tx - tile * .22, ty + tableH * .55],
      [tx + tile * .32, ty + tableH + tile * .28],
      [tx + tile * 1.5, ty + tableH + tile * .4],
      [tx + tile * 2.68, ty + tableH + tile * .28],
      [tx + tableW + tile * .22, ty + tableH * .55],
    ];

    seatPoints.forEach(([x, y], i) => {
      g.fillStyle(i % 2 ? 0xb57f52 : 0xc49162, 1);
      g.fillCircle(x, y, tile * .17);
    });

    // Dealer marker.
    g.fillStyle(0xe9d7bd, 1);
    g.fillCircle(tx + tableW / 2, ty - tile * .12, tile * .15);

    // Simple lounge footprint behind the table.
    g.fillStyle(0x594537, 1);
    g.fillRoundedRect(roomX + tile * .8, roomY + roomH - tile * 2.2, tile * 3.3, tile * 1.05, 12);

    this.add.text(width / 2, roomY + 14, "RAIN POKER PUB", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      color: "#d9b66e",
      fontStyle: "bold",
      letterSpacing: 1.5,
    }).setOrigin(.5, 0).setAlpha(.85);
  }
}
