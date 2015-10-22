'use strict';

require('../shared/gameCore');
require('./clientCore');

//A window global for our game root variable
var game = {};
//when loading we store refs to our canvases and initialize a game instance
window.onload = function () {
  game = new GameCore(); //Create the game

  game.viewport = document.getElementById('canvas');

  //Adjust canvas size
  game.viewport.width = game.world.width;
  game.viewport.height = game.world.height;

  game.ctx = game.viewport.getContext('2d'); //Fetch 2d rendering context
  game.ctx.font = '12px "Helvetica"';

  game.update(new Date().getTime()); //Start the game loop
};
