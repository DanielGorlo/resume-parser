var _ = require("underscore");
var sugar = require("sugar-date");

var resume = require("../Resume");
var fs = require("fs");
var dictionary = require("../../dictionary.js");
var logger = require("tracer").colorConsole();

var profilesWatcher = {
  // for change value by reference
  inProgress: 0
};

module.exports = {
  parse: parse
};

function makeRegExpFromDictionary() {
  var regularRules = {
    titles: {},
    profiles: [],
    inline: {}
  };

  _.forEach(dictionary.titles, function(titles, key) {
    regularRules.titles[key] = [];
    _.forEach(titles, function(title) {
      regularRules.titles[key].push(title.toUpperCase());
      regularRules.titles[key].push(
        title[0].toUpperCase() + title.substr(1, title.length)
      );
    });
  });

  _.forEach(dictionary.profiles, function(profile) {
    var profileHandler, profileExpr;

    if (_.isArray(profile)) {
      if (_.isFunction(profile[1])) {
        profileHandler = profile[1];
      }
      profile = profile[0];
    }
    profileExpr =
      "((?:https?://)?(?:www\\.)?" +
      profile.replace(".", "\\.") +
      "[/\\w \\.-]*)";
    if (_.isFunction(profileHandler)) {
      regularRules.profiles.push([profileExpr, profileHandler]);
    } else {
      regularRules.profiles.push(profileExpr);
    }
  });

  _.forEach(dictionary.inline, function(expr, name) {
    regularRules.inline[name] = expr + ":?[\\s]*(.*)";
  });

  return _.extend(dictionary, regularRules);
}

// dictionary is object, so it will be extended by reference
makeRegExpFromDictionary();

function parse(PreparedFile, cbReturnResume) {
  var rawFileData = PreparedFile.raw,
    Resume = new resume(),
    rows = rawFileData.split("\n"),
    row;

  // save prepared file text (for debug)
  //fs.writeFileSync('./parsed/'+PreparedFile.name + '.txt', rawFileData);

  // 1 parse regulars
  parseDictionaryRegular(rawFileData, Resume);

  let currentSection;
  for (var i = 0; i < rows.length; i++) {
    row = rows[i];
    // 2 parse profiles
    row = rows[i] = parseDictionaryProfiles(row, Resume);
    // 3 parse titles
    const tempCurrentSection = parseDictionaryTitles(Resume, rows, i);
    if (tempCurrentSection) {
      currentSection = tempCurrentSection;
    }

    parseDictionaryInline(Resume, row);
    parseDictionaryKeywords(Resume, row);

    if (currentSection === "experience") {
      parseDates(Resume, row);
    }
    parseNonEnglish(Resume, row);
  }

  if (_.isFunction(cbReturnResume)) {
    // wait until download and handle internet profile
    var i = 0;
    var checkTimer = setInterval(function() {
      i++;
      /**
       * FIXME:profilesWatcher.inProgress not going down to 0 for txt files
       */
      if (profilesWatcher.inProgress === 0 || i > 5) {
        //if (profilesWatcher.inProgress === 0) {
        cbReturnResume(Resume);
        clearInterval(checkTimer);
      }
    }, 200);
  } else {
    return console.error("cbReturnResume should be a function");
  }
}

/**
 * Make text from @rowNum index of @allRows to the end of @allRows
 * @param rowNum
 * @param allRows
 * @returns {string}
 */
function restoreTextByRows(rowNum, allRows) {
  rowNum = rowNum - 1;
  var rows = [];

  do {
    rows.push(allRows[rowNum]);
    rowNum++;
  } while (rowNum < allRows.length);

  return rows.join("\n");
}

/**
 * Count words in string
 * @param str
 * @returns {Number}
 */
function countWords(str) {
  return str.split(" ").length;
}

/**
 *
 * @param Resume
 * @param row
 */
function parseDictionaryInline(Resume, row) {
  var find;

  _.forEach(dictionary.inline, function(expression, key) {
    find = new RegExp(expression).exec(row);
    if (find) {
      Resume.addKey(key.toLowerCase(), find[1]);
    }
  });
}

/**
 *
 * @param data
 * @param Resume
 */
function parseDictionaryRegular(data, Resume) {
  var regularDictionary = dictionary.regular,
    find;
  // console.log('data = ' + data);
  _.forEach(regularDictionary, function(expressions, key) {
    _.forEach(expressions, function(expression) {
      find = new RegExp(expression).exec(data);
      if (find) {
        Resume.addKey(key.toLowerCase(), find[0]);
      }
    });
  });
}

function parseNonEnglish(Resume, data) {
  let nonEnglishMatch = data.match(/[^\x00-\x7F]+/);
  if (!!nonEnglishMatch) {
    Resume.setNonEnglish(true);
  }
}

function parseDates(Resume, data) {
  let cleanData = data.match(/([0-9\/]{2,6}|present)/gmi);
  let isPhoneNumber = false;

  if (!!cleanData) {
    // console.log('XP: Clean data IN: ' + cleanData);

    // Clean if it's a phone number
    cleanData.forEach(extractedDate => {
      if (!!extractedDate.match(/([0-9]{5,})/gmi)) {
        // console.log('XP: Found phone number: ' + extractedDate);
        isPhoneNumber = true;
      }
    });

    if (cleanData.length > 1 && !isPhoneNumber) {
      // Clean if there are more matches than need to be
      if (cleanData.length > 2) {
        // console.log('XP: Found bigger match groups: ' + cleanData);
        cleanData = cleanData.slice(0, 2);
      }

      // console.log('XP: Clean data OUT: ' + cleanData);

      // Turn present into today's date
      cleanData = cleanData.map(date => {
        if (("" + date).toLowerCase() === "present") {
          date = new Date().getFullYear();
        }
        // Turn months representations into years
        if (("" + date).includes("/")) {
          date = Math.floor(new Date().getFullYear() / 100) + date.split("/").slice(-1)[0];
        }
        return date;
      });

      // Calculate total years
      const past = Math.min(...cleanData);
      const future = Math.max(...cleanData);
      const totalYearsOfXp = future - past;
      console.log(cleanData);
      console.log("Total years of experience: " + totalYearsOfXp);

      Resume.addXP(totalYearsOfXp);
    }
  }
}

function parseDictionaryKeywords(Resume, data) {
  const keywordsDictionary = dictionary.keywords;

  const semiCleanData = data.toLowerCase();
  const cleanData = semiCleanData.replace(/[^\w\s]/gi, "");

  const words = cleanData.split(" ");

  _.forEach(keywordsDictionary, keywordSection => {
    const keywordsArray = keywordSection.split(",");
    keywordsArray.forEach((predefinedKeyword) => {
      if (predefinedKeyword.includes(" ") || predefinedKeyword.includes("#") || predefinedKeyword.includes(".") || predefinedKeyword.includes("-")) {
        if (semiCleanData.indexOf(predefinedKeyword) !== -1) {
          Resume.addKeyword(predefinedKeyword);
        }
      }
      else {
        _.forEach(words, word => {
          if (word === predefinedKeyword) {
            Resume.addKeyword(predefinedKeyword);
          }
        });
      }
    });
  });
}

/**
 *
 * @param Resume
 * @param rows
 * @param rowIdx
 */
function parseDictionaryTitles(Resume, rows, rowIdx) {
  var allTitles = _.flatten(_.toArray(dictionary.titles)).join("|"),
    searchExpression = "",
    row = rows[rowIdx],
    ruleExpression,
    isRuleFound,
    result;

  let foundKey;
  _.forEach(dictionary.titles, function(expressions, key) {
    expressions = expressions || [];
    // means, that titled row is less than 5 words
    if (countWords(row) <= 5) {
      _.forEach(expressions, function(expression) {
        ruleExpression = new RegExp(expression);
        isRuleFound = ruleExpression.test(row);

        if (isRuleFound) {
          allTitles = _.without(allTitles.split("|"), key).join("|");
          searchExpression =
            "(?:" + expression + ")((.*\n)+?)(?:" + allTitles + "|{end})";
          // restore remaining text to search in relevant part of text
          result = new RegExp(searchExpression, "gm").exec(
            restoreTextByRows(rowIdx, rows)
          );

          if (result) {
            Resume.addKey(key, result[1]);
            foundKey = key;
          }
        }
      });
    }
  });
  return foundKey;
}

/**
 *
 * @param row
 * @param Resume
 * @returns {*}
 */
function parseDictionaryProfiles(row, Resume) {
  var regularDictionary = dictionary.profiles,
    find,
    modifiedRow = row;

  _.forEach(regularDictionary, function(expression) {
    var expressionHandler;

    if (_.isArray(expression)) {
      if (_.isFunction(expression[1])) {
        expressionHandler = expression[1];
      }
      expression = expression[0];
    }
    find = new RegExp(expression).exec(row);
    if (find) {
      Resume.addKey("profiles", find[0] + "\n");
      modifiedRow = row.replace(find[0], "");
      if (_.isFunction(expressionHandler)) {
        profilesWatcher.inProgress++;
        expressionHandler(find[0], Resume, profilesWatcher);
      }
    }
  });

  return modifiedRow;
}
