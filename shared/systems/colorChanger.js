'use strict';

/*
An example of a composition based system.
Serves no purpose if actually used.
 */

if ('undefined' !== typeof (global)) //if we are serverside grab mathUtils
  var mathUtils = require('../utils/mathUtils');

const colorChanger = (state) => ({
  change: () => {
    state.game.color = mathUtils.randomColor();
  }
});

if ('undefined' !== typeof (global)) //If we are serverside export functions
  module.exports = colorChanger;
