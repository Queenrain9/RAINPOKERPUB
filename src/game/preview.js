import { PreviewScene } from "./PreviewScene.js";

let previewGame = null;

export function mountLandingPreview() {
  const parent = document.querySelector("#landing-game");
  if (!parent || previewGame) return;

  previewGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: window.innerWidth,
    height: window.innerHeight,
    transparent: true,
    render: {
      antialias: true,
      pixelArt: false,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [PreviewScene],
    input: {
      mouse: false,
      touch: false,
      keyboard: false,
    },
    audio: {
      noAudio: true,
    },
  });
}
