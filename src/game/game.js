import { GameScene } from "./GameScene.js";

let liveGame = null;

export function mountLiveGame(initialState, callbacks = {}) {
  destroyLiveGame();

  const parent = document.querySelector("#pub-game");
  if (!parent) throw new Error("GAME_PARENT_NOT_FOUND");

  const scene = new GameScene(initialState, callbacks);

  liveGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || window.innerWidth,
    height: parent.clientHeight || window.innerHeight,
    transparent: false,
    render: {
      antialias: true,
      pixelArt: false,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [scene],
    audio: {
      noAudio: true,
    },
  });

  return {
    setState(nextState) {
      scene.setState(nextState);
    },
    getState() {
      return scene.getState();
    },
    setPlacementMode(mode) {
      scene.setPlacementMode(mode);
    },
  };
}

export function destroyLiveGame() {
  if (!liveGame) return;
  liveGame.destroy(true);
  liveGame = null;
}
