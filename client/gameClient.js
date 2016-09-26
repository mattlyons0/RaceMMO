'use strict';

require('./lib/pixi');
require('../shared/gameCore');
require('./clientCore');

//A window global for our game root variable
window.game = {};
//when loading we store refs to our canvases and initialize a game instance
window.onload = function () {
  window.debug = require('debug');
  window.debug('RaceMMO:GameClient')('Debugging Enabled');
  window.game = new GameCore(); //Create the game engine

  //Create Renderer Element
  window.game.renderer = PIXI.autoDetectRenderer(window.game.world.width,window.game.world.height, { transparent: true });
  document.body.appendChild(window.game.renderer.view);

  //Create root of scene graph
  window.game.layers = {};
  window.game.layers.stage = new PIXI.Container();
  window.game.layers.gui = new PIXI.Container();
  window.game.layers.field = new PIXI.Container();
  window.game.layers.stage.addChild(window.game.layers.gui);
  window.game.layers.stage.addChild(window.game.layers.field);

  window.game.update(new Date().getTime()); //Start the game loop
};
