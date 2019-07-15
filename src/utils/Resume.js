var _ = require("underscore");

module.exports = function() {
  return new Resume();
};

function Resume() {
  // generic resume format
  this.parts = {};
  this.parts.keywords = [];
  this.parts.totalExperience = 0;
  this.parts.isNonEnglish = false;
}

Resume.prototype.addKey = function(key, value) {
  value = value || "";
  value = value.trim();
  // reject falsy values
  if (value) {
    if (_.has(this.parts, key)) {
      value = this.parts[key] + value;
    }

    this.parts[key] = value;
  }
};

Resume.prototype.setNonEnglish = function(value) {
  this.parts.isNonEnglish = this.parts.isNonEnglish || value;
};

Resume.prototype.addXP = function(value) {
  value = parseInt(value);
  this.parts.totalExperience = this.parts.totalExperience + value;
};

Resume.prototype.addKeyword = function(value) {
  value = value || "";
  value = value.trim();

  if (this.parts["keywords"].indexOf(value) === -1) {
    this.parts["keywords"].push(value);
  }
};

Resume.prototype.addObject = function(key, options) {
  var self = this;

  if (!_.has(this.parts, key)) {
    this.parts[key] = {};
  }

  _.forEach(options, function(optionVal, optionName) {
    if (optionVal) {
      self.parts[key][optionName] = optionVal;
    }
  });
};

/**
 *
 * @returns {String}
 */
Resume.prototype.jsoned = function() {
  return JSON.stringify(this.parts);
};
