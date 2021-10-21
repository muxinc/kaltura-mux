
import { BasePlugin } from 'kaltura-player-js';
import initKalturaMux from './kalturaMux';

var kalturaMuxJsPlugin = function (name, player, config) {
  BasePlugin.call(this, name, player, config);
  this._addBindings();
};

kalturaMuxJsPlugin.createPlugin = BasePlugin.createPlugin;
kalturaMuxJsPlugin.prototype = new BasePlugin();
kalturaMuxJsPlugin.defaultConfig = {};

kalturaMuxJsPlugin.isValid = function (player) {
  return true;
};

kalturaMuxJsPlugin.prototype.destroy = function () { };
kalturaMuxJsPlugin.prototype.reset = function () { };

kalturaMuxJsPlugin.prototype._addBindings = function () {
  initKalturaMux(this.player);
};

export default kalturaMuxJsPlugin;
