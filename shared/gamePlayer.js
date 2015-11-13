/**
 * @constructor
 * Player Class, manage player state and draw if needed
 * @param gameInstance instance of game
 * @param playerInstance instance of player
 */
var GamePlayer = function (gameInstance, playerInstance) {
  //Store Instance
  this.instance = playerInstance; //SocketIO instance
  this.game = gameInstance; //TODO determine if this should be under state or not

  //Setup State
  this.state = {};
  this.state.size = {x: 16, y: 16, hx: 8, hy: 8}; //x,y,heightX,heightY
  this.state.id = ''; //Will be assigned later
  this.state.label = 'not-connected';
  this.state.online = false;

  //Setup Physics State
  this.physicsState = {};
  this.physicsState.pos = {x: 0, y: 0};
  this.physicsState.oldPos = {x: 0, y: 0};
  this.physicsState.inputs = []; //History of inputs
  this.physicsState.lastInputTime = 0;
  this.physicsState.lastInputSeq = 0;
  this.physicsState.currentState = {pos: {x: 0, y: 0}};
  this.physicsState.stateTime = new Date().getTime();

  if (playerInstance) {
    this.state.online = true;
    this.state.label = 'connected';
  }

  this.oldState = {hash: '0', state: {}}; //OldState only contains a hash of the current state, and a duplicate of the state from a update ago

  //World bounds
  this.state.posLimits = { //TODO consider moving this out of state
    xMin: this.state.size.hx,
    xMax: this.game.world.width - this.state.size.hx,
    yMin: this.state.size.hy,
    yMax: this.game.world.height - this.state.size.hy
  };

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
  if (this.state.fakeClient) return;

  //Example of a composition system
  //this.colorChanger.change();

  //Draw Player Rectangle
  this.game.ctx.fillStyle = 'rgba(255,255,255,0.1)'; //Draw grey if online is false
  if (this.state.online === true)
    this.game.ctx.fillStyle = this.state.color;
  this.game.ctx.fillRect(this.physicsState.pos.x - this.state.size.hx, this.physicsState.pos.y - this.state.size.hy, this.state.size.x, this.state.size.y);
  //Draw Player Status
  if (this.state.online === true)
    this.game.ctx.fillStyle = this.state.infoColor;
  this.game.ctx.fillText(this.state.label, this.physicsState.pos.x + 10, this.physicsState.pos.y + 4);
};

module.exports = GamePlayer;
