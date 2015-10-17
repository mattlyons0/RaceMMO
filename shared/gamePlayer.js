/**
 * @constructor
 * Player Class, manage player state and draw if needed
 * @param gameInstance instance of game
 * @param playerInstance instance of player
 */
var GamePlayer = function (gameInstance, playerInstance) {
  //Store Instance
  this.instance = playerInstance;
  this.game = gameInstance;

  //Setup State
  this.pos = {x: 0, y: 0};
  this.size = {x: 16, y: 16, hx: 8, hy: 8}; //x,y,heightX,heightY
  this.state = 'not-connected';
  this.id = ''; //Will be assigned later
  this.online = false;
  if (playerInstance)
    this.online = true;

  //Movement
  this.oldState = {pos: {x: 0, y: 0}};
  this.currentState = {pos: {x: 0, y: 0}};
  this.stateTime = new Date().getTime();

  this.inputs = []; //History of inputs

  //World bounds
  this.posLimits = {
    xMin: this.size.hx,
    xMax: this.game.world.width - this.size.hx,
    yMin: this.size.hy,
    yMax: this.game.world.height - this.size.hy
  };
  this.pos = {x: 0, y: 0}; //Need to update this later

  //Example of composition system
  /*
  if ('undefined' !== typeof (global)) //if we are serverside
    this.colorChanger = require('./systems/colorChanger')(this);
  else
    this.colorChanger = colorChanger(this);
  */
};

/**
 * Draw on client using game.ctx
 * //TODO figure out where this should go, as it is clientside drawing
 */
GamePlayer.prototype.draw = function () {
  if (fakeClient) return;

  //Example of a composition system
  //this.colorChanger.change();

  //Draw Player Rectangle
  game.ctx.fillStyle = 'rgba(255,255,255,0.1)'; //Draw grey if online is false
  if (this.online === true)
    game.ctx.fillStyle = this.color;
  if (this.id === this.game.socket.userID)
    game.ctx.fillStyle = this.game.color;
  game.ctx.fillRect(this.pos.x - this.size.hx, this.pos.y - this.size.hy, this.size.x, this.size.y);
  //Draw Player Status
  if (this.online === true)
    game.ctx.fillStyle = this.infoColor;
  game.ctx.fillText(this.state, this.pos.x + 10, this.pos.y + 4);
};

if ('undefined' != typeof (global)) //If we are serverside export functions
  module.exports = GamePlayer;
