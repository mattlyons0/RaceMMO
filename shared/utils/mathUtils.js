var mathUtils={};

/*
  2D vector code helpers and rounding helpers
 */

/**
 * Rounds number to n places
 * @param n places to round
 * @returns {Number} rounded number to n places
 */
Number.prototype.fixed = function (n) {
  n = n || 3;
  return parseFloat(this.toFixed(n));
};
/**
 * Copies 2d vector to another 2d vector
 * @param a vector to copy
 * @returns {{x: (number|*|Number), y: (number|*|Number)}} copied vector
 */
mathUtils.pos = function (a) {
  return {x: a.x, y: a.y};
};
/**
 * Add 2d vectors
 * @param a vector 1 to add
 * @param b vector 2 to add
 * @returns {{x: (Number|string), y: (Number|string)}} the resulting vector after vector addition
 */
mathUtils.vAdd = function (a, b) {
  return {x: (a.x + b.x).fixed(), y: (a.y + b.y).fixed()};
};
/**
 * Subtract 2d vectors
 * @param a vector 1 to subtract
 * @param b vector 2 to subtract
 * @returns {{x: Number, y: Number}} the resulting vector after subracting a from b
 */
mathUtils.vSub = function (a, b) {
  return {x: (a.x - b.x).fixed(), y: (a.y - b.y).fixed()};
};
/**
 * Multiply a vector by a scalar
 * @param a vector
 * @param b scalar
 * @returns {{x: Number, y: Number}} the result of the scalar multiplication
 */
mathUtils.vMultScalar = function (a, b) {
  return {x: (a.x * b).fixed(), y: (a.y * b).fixed()};
};
/**
 * Simple linear interpolation
 * @param p
 * @param n
 * @param t
 * @returns {Number|string}
 */
mathUtils.lerp = function (p, n, t) {
  var _t = Number(t);
  _t = (Math.max(0, Math.min(1, _t))).fixed();
  return (p + _t * (n - p)).fixed();
};
/**
 * Simple linear interpolation between 2 vectors
 * @param v
 * @param tv
 * @param t
 * @returns {{x: (Number|string), y: (Number|string)}}
 */
mathUtils.vLerp = function (v, tv, t) {
  return {x: this.lerp(v.x, tv.x, t), y: this.lerp(v.y, tv.y, t)};
};
/**
 * Returns a random integer between min (inclusive) and max (inclusive)
 * Using Math.round() will give you a non-uniform distribution!
 */
mathUtils.randomInt = function (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Generates a random color in hex
 * @returns {string} random color
 */
mathUtils.randomColor = function () {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
};


if('undefined' != typeof (global)) //If we are serverside export functions
  module.exports=mathUtils;
