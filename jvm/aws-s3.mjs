var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e2) {
    throw err = [e2], e2;
  }
};
var __commonJS = (cb2, mod) => function __require() {
  try {
    return mod || (0, cb2[__getOwnPropNames(cb2)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e2) {
    throw mod = 0, e2;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/fast-xml-parser/src/util.js
var require_util = __commonJS({
  "node_modules/fast-xml-parser/src/util.js"(exports) {
    "use strict";
    var nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
    var nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
    var nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
    var regexName = new RegExp("^" + nameRegexp + "$");
    var getAllMatches = function(string, regex) {
      const matches = [];
      let match = regex.exec(string);
      while (match) {
        const allmatches = [];
        allmatches.startIndex = regex.lastIndex - match[0].length;
        const len = match.length;
        for (let index = 0; index < len; index++) {
          allmatches.push(match[index]);
        }
        matches.push(allmatches);
        match = regex.exec(string);
      }
      return matches;
    };
    var isName = function(string) {
      const match = regexName.exec(string);
      return !(match === null || typeof match === "undefined");
    };
    exports.isExist = function(v2) {
      return typeof v2 !== "undefined";
    };
    exports.isEmptyObject = function(obj) {
      return Object.keys(obj).length === 0;
    };
    exports.merge = function(target, a2, arrayMode) {
      if (a2) {
        const keys = Object.keys(a2);
        const len = keys.length;
        for (let i2 = 0; i2 < len; i2++) {
          if (arrayMode === "strict") {
            target[keys[i2]] = [a2[keys[i2]]];
          } else {
            target[keys[i2]] = a2[keys[i2]];
          }
        }
      }
    };
    exports.getValue = function(v2) {
      if (exports.isExist(v2)) {
        return v2;
      } else {
        return "";
      }
    };
    exports.isName = isName;
    exports.getAllMatches = getAllMatches;
    exports.nameRegexp = nameRegexp;
  }
});

// node_modules/fast-xml-parser/src/validator.js
var require_validator = __commonJS({
  "node_modules/fast-xml-parser/src/validator.js"(exports) {
    "use strict";
    var util = require_util();
    var defaultOptions = {
      allowBooleanAttributes: false,
      //A tag can have attributes without any value
      unpairedTags: []
    };
    exports.validate = function(xmlData, options) {
      options = Object.assign({}, defaultOptions, options);
      const tags = [];
      let tagFound = false;
      let reachedRoot = false;
      if (xmlData[0] === "\uFEFF") {
        xmlData = xmlData.substr(1);
      }
      for (let i2 = 0; i2 < xmlData.length; i2++) {
        if (xmlData[i2] === "<" && xmlData[i2 + 1] === "?") {
          i2 += 2;
          i2 = readPI(xmlData, i2);
          if (i2.err) return i2;
        } else if (xmlData[i2] === "<") {
          let tagStartPos = i2;
          i2++;
          if (xmlData[i2] === "!") {
            i2 = readCommentAndCDATA(xmlData, i2);
            continue;
          } else {
            let closingTag = false;
            if (xmlData[i2] === "/") {
              closingTag = true;
              i2++;
            }
            let tagName = "";
            for (; i2 < xmlData.length && xmlData[i2] !== ">" && xmlData[i2] !== " " && xmlData[i2] !== "	" && xmlData[i2] !== "\n" && xmlData[i2] !== "\r"; i2++) {
              tagName += xmlData[i2];
            }
            tagName = tagName.trim();
            if (tagName[tagName.length - 1] === "/") {
              tagName = tagName.substring(0, tagName.length - 1);
              i2--;
            }
            if (!validateTagName(tagName)) {
              let msg;
              if (tagName.trim().length === 0) {
                msg = "Invalid space after '<'.";
              } else {
                msg = "Tag '" + tagName + "' is an invalid name.";
              }
              return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i2));
            }
            const result = readAttributeStr(xmlData, i2);
            if (result === false) {
              return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i2));
            }
            let attrStr = result.value;
            i2 = result.index;
            if (attrStr[attrStr.length - 1] === "/") {
              const attrStrStart = i2 - attrStr.length;
              attrStr = attrStr.substring(0, attrStr.length - 1);
              const isValid = validateAttributeString(attrStr, options);
              if (isValid === true) {
                tagFound = true;
              } else {
                return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
              }
            } else if (closingTag) {
              if (!result.tagClosed) {
                return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i2));
              } else if (attrStr.trim().length > 0) {
                return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
              } else {
                const otg = tags.pop();
                if (tagName !== otg.tagName) {
                  let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
                  return getErrorObject(
                    "InvalidTag",
                    "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                    getLineNumberForPosition(xmlData, tagStartPos)
                  );
                }
                if (tags.length == 0) {
                  reachedRoot = true;
                }
              }
            } else {
              const isValid = validateAttributeString(attrStr, options);
              if (isValid !== true) {
                return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i2 - attrStr.length + isValid.err.line));
              }
              if (reachedRoot === true) {
                return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i2));
              } else if (options.unpairedTags.indexOf(tagName) !== -1) {
              } else {
                tags.push({ tagName, tagStartPos });
              }
              tagFound = true;
            }
            for (i2++; i2 < xmlData.length; i2++) {
              if (xmlData[i2] === "<") {
                if (xmlData[i2 + 1] === "!") {
                  i2++;
                  i2 = readCommentAndCDATA(xmlData, i2);
                  continue;
                } else if (xmlData[i2 + 1] === "?") {
                  i2 = readPI(xmlData, ++i2);
                  if (i2.err) return i2;
                } else {
                  break;
                }
              } else if (xmlData[i2] === "&") {
                const afterAmp = validateAmpersand(xmlData, i2);
                if (afterAmp == -1)
                  return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i2));
                i2 = afterAmp;
              } else {
                if (reachedRoot === true && !isWhiteSpace(xmlData[i2])) {
                  return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i2));
                }
              }
            }
            if (xmlData[i2] === "<") {
              i2--;
            }
          }
        } else {
          if (isWhiteSpace(xmlData[i2])) {
            continue;
          }
          return getErrorObject("InvalidChar", "char '" + xmlData[i2] + "' is not expected.", getLineNumberForPosition(xmlData, i2));
        }
      }
      if (!tagFound) {
        return getErrorObject("InvalidXml", "Start tag expected.", 1);
      } else if (tags.length == 1) {
        return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
      } else if (tags.length > 0) {
        return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t2) => t2.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
      }
      return true;
    };
    function isWhiteSpace(char) {
      return char === " " || char === "	" || char === "\n" || char === "\r";
    }
    function readPI(xmlData, i2) {
      const start = i2;
      for (; i2 < xmlData.length; i2++) {
        if (xmlData[i2] == "?" || xmlData[i2] == " ") {
          const tagname = xmlData.substr(start, i2 - start);
          if (i2 > 5 && tagname === "xml") {
            return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i2));
          } else if (xmlData[i2] == "?" && xmlData[i2 + 1] == ">") {
            i2++;
            break;
          } else {
            continue;
          }
        }
      }
      return i2;
    }
    function readCommentAndCDATA(xmlData, i2) {
      if (xmlData.length > i2 + 5 && xmlData[i2 + 1] === "-" && xmlData[i2 + 2] === "-") {
        for (i2 += 3; i2 < xmlData.length; i2++) {
          if (xmlData[i2] === "-" && xmlData[i2 + 1] === "-" && xmlData[i2 + 2] === ">") {
            i2 += 2;
            break;
          }
        }
      } else if (xmlData.length > i2 + 8 && xmlData[i2 + 1] === "D" && xmlData[i2 + 2] === "O" && xmlData[i2 + 3] === "C" && xmlData[i2 + 4] === "T" && xmlData[i2 + 5] === "Y" && xmlData[i2 + 6] === "P" && xmlData[i2 + 7] === "E") {
        let angleBracketsCount = 1;
        for (i2 += 8; i2 < xmlData.length; i2++) {
          if (xmlData[i2] === "<") {
            angleBracketsCount++;
          } else if (xmlData[i2] === ">") {
            angleBracketsCount--;
            if (angleBracketsCount === 0) {
              break;
            }
          }
        }
      } else if (xmlData.length > i2 + 9 && xmlData[i2 + 1] === "[" && xmlData[i2 + 2] === "C" && xmlData[i2 + 3] === "D" && xmlData[i2 + 4] === "A" && xmlData[i2 + 5] === "T" && xmlData[i2 + 6] === "A" && xmlData[i2 + 7] === "[") {
        for (i2 += 8; i2 < xmlData.length; i2++) {
          if (xmlData[i2] === "]" && xmlData[i2 + 1] === "]" && xmlData[i2 + 2] === ">") {
            i2 += 2;
            break;
          }
        }
      }
      return i2;
    }
    var doubleQuote = '"';
    var singleQuote = "'";
    function readAttributeStr(xmlData, i2) {
      let attrStr = "";
      let startChar = "";
      let tagClosed = false;
      for (; i2 < xmlData.length; i2++) {
        if (xmlData[i2] === doubleQuote || xmlData[i2] === singleQuote) {
          if (startChar === "") {
            startChar = xmlData[i2];
          } else if (startChar !== xmlData[i2]) {
          } else {
            startChar = "";
          }
        } else if (xmlData[i2] === ">") {
          if (startChar === "") {
            tagClosed = true;
            break;
          }
        }
        attrStr += xmlData[i2];
      }
      if (startChar !== "") {
        return false;
      }
      return {
        value: attrStr,
        index: i2,
        tagClosed
      };
    }
    var validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
    function validateAttributeString(attrStr, options) {
      const matches = util.getAllMatches(attrStr, validAttrStrRegxp);
      const attrNames = {};
      for (let i2 = 0; i2 < matches.length; i2++) {
        if (matches[i2][1].length === 0) {
          return getErrorObject("InvalidAttr", "Attribute '" + matches[i2][2] + "' has no space in starting.", getPositionFromMatch(matches[i2]));
        } else if (matches[i2][3] !== void 0 && matches[i2][4] === void 0) {
          return getErrorObject("InvalidAttr", "Attribute '" + matches[i2][2] + "' is without value.", getPositionFromMatch(matches[i2]));
        } else if (matches[i2][3] === void 0 && !options.allowBooleanAttributes) {
          return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i2][2] + "' is not allowed.", getPositionFromMatch(matches[i2]));
        }
        const attrName = matches[i2][2];
        if (!validateAttrName(attrName)) {
          return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i2]));
        }
        if (!attrNames.hasOwnProperty(attrName)) {
          attrNames[attrName] = 1;
        } else {
          return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i2]));
        }
      }
      return true;
    }
    function validateNumberAmpersand(xmlData, i2) {
      let re = /\d/;
      if (xmlData[i2] === "x") {
        i2++;
        re = /[\da-fA-F]/;
      }
      for (; i2 < xmlData.length; i2++) {
        if (xmlData[i2] === ";")
          return i2;
        if (!xmlData[i2].match(re))
          break;
      }
      return -1;
    }
    function validateAmpersand(xmlData, i2) {
      i2++;
      if (xmlData[i2] === ";")
        return -1;
      if (xmlData[i2] === "#") {
        i2++;
        return validateNumberAmpersand(xmlData, i2);
      }
      let count = 0;
      for (; i2 < xmlData.length; i2++, count++) {
        if (xmlData[i2].match(/\w/) && count < 20)
          continue;
        if (xmlData[i2] === ";")
          break;
        return -1;
      }
      return i2;
    }
    function getErrorObject(code, message, lineNumber) {
      return {
        err: {
          code,
          msg: message,
          line: lineNumber.line || lineNumber,
          col: lineNumber.col
        }
      };
    }
    function validateAttrName(attrName) {
      return util.isName(attrName);
    }
    function validateTagName(tagname) {
      return util.isName(tagname);
    }
    function getLineNumberForPosition(xmlData, index) {
      const lines = xmlData.substring(0, index).split(/\r?\n/);
      return {
        line: lines.length,
        // column number is last line's length + 1, because column numbering starts at 1:
        col: lines[lines.length - 1].length + 1
      };
    }
    function getPositionFromMatch(match) {
      return match.startIndex + match[1].length;
    }
  }
});

// node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
var require_OptionsBuilder = __commonJS({
  "node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js"(exports) {
    var defaultOptions = {
      preserveOrder: false,
      attributeNamePrefix: "@_",
      attributesGroupName: false,
      textNodeName: "#text",
      ignoreAttributes: true,
      removeNSPrefix: false,
      // remove NS from tag name or attribute name if true
      allowBooleanAttributes: false,
      //a tag can have attributes without any value
      //ignoreRootElement : false,
      parseTagValue: true,
      parseAttributeValue: false,
      trimValues: true,
      //Trim string values of tag and attributes
      cdataPropName: false,
      numberParseOptions: {
        hex: true,
        leadingZeros: true,
        eNotation: true
      },
      tagValueProcessor: function(tagName, val2) {
        return val2;
      },
      attributeValueProcessor: function(attrName, val2) {
        return val2;
      },
      stopNodes: [],
      //nested tags will not be parsed even for errors
      alwaysCreateTextNode: false,
      isArray: () => false,
      commentPropName: false,
      unpairedTags: [],
      processEntities: true,
      htmlEntities: false,
      ignoreDeclaration: false,
      ignorePiTags: false,
      transformTagName: false,
      transformAttributeName: false,
      updateTag: function(tagName, jPath, attrs) {
        return tagName;
      }
      // skipEmptyListItem: false
    };
    var buildOptions = function(options) {
      return Object.assign({}, defaultOptions, options);
    };
    exports.buildOptions = buildOptions;
    exports.defaultOptions = defaultOptions;
  }
});

// node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
var require_xmlNode = __commonJS({
  "node_modules/fast-xml-parser/src/xmlparser/xmlNode.js"(exports, module) {
    "use strict";
    var XmlNode2 = class {
      constructor(tagname) {
        this.tagname = tagname;
        this.child = [];
        this[":@"] = {};
      }
      add(key, val2) {
        if (key === "__proto__") key = "#__proto__";
        this.child.push({ [key]: val2 });
      }
      addChild(node) {
        if (node.tagname === "__proto__") node.tagname = "#__proto__";
        if (node[":@"] && Object.keys(node[":@"]).length > 0) {
          this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
        } else {
          this.child.push({ [node.tagname]: node.child });
        }
      }
    };
    module.exports = XmlNode2;
  }
});

// node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
var require_DocTypeReader = __commonJS({
  "node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js"(exports, module) {
    var util = require_util();
    function readDocType(xmlData, i2) {
      const entities = {};
      if (xmlData[i2 + 3] === "O" && xmlData[i2 + 4] === "C" && xmlData[i2 + 5] === "T" && xmlData[i2 + 6] === "Y" && xmlData[i2 + 7] === "P" && xmlData[i2 + 8] === "E") {
        i2 = i2 + 9;
        let angleBracketsCount = 1;
        let hasBody = false, comment = false;
        let exp = "";
        for (; i2 < xmlData.length; i2++) {
          if (xmlData[i2] === "<" && !comment) {
            if (hasBody && isEntity(xmlData, i2)) {
              i2 += 7;
              [entityName, val, i2] = readEntityExp(xmlData, i2 + 1);
              if (val.indexOf("&") === -1)
                entities[validateEntityName(entityName)] = {
                  regx: RegExp(`&${entityName};`, "g"),
                  val
                };
            } else if (hasBody && isElement(xmlData, i2)) i2 += 8;
            else if (hasBody && isAttlist(xmlData, i2)) i2 += 8;
            else if (hasBody && isNotation(xmlData, i2)) i2 += 9;
            else if (isComment) comment = true;
            else throw new Error("Invalid DOCTYPE");
            angleBracketsCount++;
            exp = "";
          } else if (xmlData[i2] === ">") {
            if (comment) {
              if (xmlData[i2 - 1] === "-" && xmlData[i2 - 2] === "-") {
                comment = false;
                angleBracketsCount--;
              }
            } else {
              angleBracketsCount--;
            }
            if (angleBracketsCount === 0) {
              break;
            }
          } else if (xmlData[i2] === "[") {
            hasBody = true;
          } else {
            exp += xmlData[i2];
          }
        }
        if (angleBracketsCount !== 0) {
          throw new Error(`Unclosed DOCTYPE`);
        }
      } else {
        throw new Error(`Invalid Tag instead of DOCTYPE`);
      }
      return { entities, i: i2 };
    }
    function readEntityExp(xmlData, i2) {
      let entityName2 = "";
      for (; i2 < xmlData.length && (xmlData[i2] !== "'" && xmlData[i2] !== '"'); i2++) {
        entityName2 += xmlData[i2];
      }
      entityName2 = entityName2.trim();
      if (entityName2.indexOf(" ") !== -1) throw new Error("External entites are not supported");
      const startChar = xmlData[i2++];
      let val2 = "";
      for (; i2 < xmlData.length && xmlData[i2] !== startChar; i2++) {
        val2 += xmlData[i2];
      }
      return [entityName2, val2, i2];
    }
    function isComment(xmlData, i2) {
      if (xmlData[i2 + 1] === "!" && xmlData[i2 + 2] === "-" && xmlData[i2 + 3] === "-") return true;
      return false;
    }
    function isEntity(xmlData, i2) {
      if (xmlData[i2 + 1] === "!" && xmlData[i2 + 2] === "E" && xmlData[i2 + 3] === "N" && xmlData[i2 + 4] === "T" && xmlData[i2 + 5] === "I" && xmlData[i2 + 6] === "T" && xmlData[i2 + 7] === "Y") return true;
      return false;
    }
    function isElement(xmlData, i2) {
      if (xmlData[i2 + 1] === "!" && xmlData[i2 + 2] === "E" && xmlData[i2 + 3] === "L" && xmlData[i2 + 4] === "E" && xmlData[i2 + 5] === "M" && xmlData[i2 + 6] === "E" && xmlData[i2 + 7] === "N" && xmlData[i2 + 8] === "T") return true;
      return false;
    }
    function isAttlist(xmlData, i2) {
      if (xmlData[i2 + 1] === "!" && xmlData[i2 + 2] === "A" && xmlData[i2 + 3] === "T" && xmlData[i2 + 4] === "T" && xmlData[i2 + 5] === "L" && xmlData[i2 + 6] === "I" && xmlData[i2 + 7] === "S" && xmlData[i2 + 8] === "T") return true;
      return false;
    }
    function isNotation(xmlData, i2) {
      if (xmlData[i2 + 1] === "!" && xmlData[i2 + 2] === "N" && xmlData[i2 + 3] === "O" && xmlData[i2 + 4] === "T" && xmlData[i2 + 5] === "A" && xmlData[i2 + 6] === "T" && xmlData[i2 + 7] === "I" && xmlData[i2 + 8] === "O" && xmlData[i2 + 9] === "N") return true;
      return false;
    }
    function validateEntityName(name) {
      if (util.isName(name))
        return name;
      else
        throw new Error(`Invalid entity name ${name}`);
    }
    module.exports = readDocType;
  }
});

// node_modules/strnum/strnum.js
var require_strnum = __commonJS({
  "node_modules/strnum/strnum.js"(exports, module) {
    var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
    var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
    var consider = {
      hex: true,
      // oct: false,
      leadingZeros: true,
      decimalPoint: ".",
      eNotation: true
      //skipLike: /regex/
    };
    function toNumber(str, options = {}) {
      options = Object.assign({}, consider, options);
      if (!str || typeof str !== "string") return str;
      let trimmedStr = str.trim();
      if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
      else if (str === "0") return 0;
      else if (options.hex && hexRegex.test(trimmedStr)) {
        return parse_int(trimmedStr, 16);
      } else if (trimmedStr.search(/[eE]/) !== -1) {
        const notation = trimmedStr.match(/^([-\+])?(0*)([0-9]*(\.[0-9]*)?[eE][-\+]?[0-9]+)$/);
        if (notation) {
          if (options.leadingZeros) {
            trimmedStr = (notation[1] || "") + notation[3];
          } else {
            if (notation[2] === "0" && notation[3][0] === ".") {
            } else {
              return str;
            }
          }
          return options.eNotation ? Number(trimmedStr) : str;
        } else {
          return str;
        }
      } else {
        const match = numRegex.exec(trimmedStr);
        if (match) {
          const sign = match[1];
          const leadingZeros = match[2];
          let numTrimmedByZeros = trimZeros(match[3]);
          if (!options.leadingZeros && leadingZeros.length > 0 && sign && trimmedStr[2] !== ".") return str;
          else if (!options.leadingZeros && leadingZeros.length > 0 && !sign && trimmedStr[1] !== ".") return str;
          else if (options.leadingZeros && leadingZeros === str) return 0;
          else {
            const num = Number(trimmedStr);
            const numStr = "" + num;
            if (numStr.search(/[eE]/) !== -1) {
              if (options.eNotation) return num;
              else return str;
            } else if (trimmedStr.indexOf(".") !== -1) {
              if (numStr === "0" && numTrimmedByZeros === "") return num;
              else if (numStr === numTrimmedByZeros) return num;
              else if (sign && numStr === "-" + numTrimmedByZeros) return num;
              else return str;
            }
            if (leadingZeros) {
              return numTrimmedByZeros === numStr || sign + numTrimmedByZeros === numStr ? num : str;
            } else {
              return trimmedStr === numStr || trimmedStr === sign + numStr ? num : str;
            }
          }
        } else {
          return str;
        }
      }
    }
    function trimZeros(numStr) {
      if (numStr && numStr.indexOf(".") !== -1) {
        numStr = numStr.replace(/0+$/, "");
        if (numStr === ".") numStr = "0";
        else if (numStr[0] === ".") numStr = "0" + numStr;
        else if (numStr[numStr.length - 1] === ".") numStr = numStr.substr(0, numStr.length - 1);
        return numStr;
      }
      return numStr;
    }
    function parse_int(numStr, base) {
      if (parseInt) return parseInt(numStr, base);
      else if (Number.parseInt) return Number.parseInt(numStr, base);
      else if (window && window.parseInt) return window.parseInt(numStr, base);
      else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
    }
    module.exports = toNumber;
  }
});

// node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
var require_OrderedObjParser = __commonJS({
  "node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js"(exports, module) {
    "use strict";
    var util = require_util();
    var xmlNode = require_xmlNode();
    var readDocType = require_DocTypeReader();
    var toNumber = require_strnum();
    var regx = "<((!\\[CDATA\\[([\\s\\S]*?)(]]>))|((NAME:)?(NAME))([^>]*)>|((\\/)(NAME)\\s*>))([^<]*)".replace(/NAME/g, util.nameRegexp);
    var OrderedObjParser = class {
      constructor(options) {
        this.options = options;
        this.currentNode = null;
        this.tagsNodeStack = [];
        this.docTypeEntities = {};
        this.lastEntities = {
          "apos": { regex: /&(apos|#39|#x27);/g, val: "'" },
          "gt": { regex: /&(gt|#62|#x3E);/g, val: ">" },
          "lt": { regex: /&(lt|#60|#x3C);/g, val: "<" },
          "quot": { regex: /&(quot|#34|#x22);/g, val: '"' }
        };
        this.ampEntity = { regex: /&(amp|#38|#x26);/g, val: "&" };
        this.htmlEntities = {
          "space": { regex: /&(nbsp|#160);/g, val: " " },
          // "lt" : { regex: /&(lt|#60);/g, val: "<" },
          // "gt" : { regex: /&(gt|#62);/g, val: ">" },
          // "amp" : { regex: /&(amp|#38);/g, val: "&" },
          // "quot" : { regex: /&(quot|#34);/g, val: "\"" },
          // "apos" : { regex: /&(apos|#39);/g, val: "'" },
          "cent": { regex: /&(cent|#162);/g, val: "\xA2" },
          "pound": { regex: /&(pound|#163);/g, val: "\xA3" },
          "yen": { regex: /&(yen|#165);/g, val: "\xA5" },
          "euro": { regex: /&(euro|#8364);/g, val: "\u20AC" },
          "copyright": { regex: /&(copy|#169);/g, val: "\xA9" },
          "reg": { regex: /&(reg|#174);/g, val: "\xAE" },
          "inr": { regex: /&(inr|#8377);/g, val: "\u20B9" }
        };
        this.addExternalEntities = addExternalEntities;
        this.parseXml = parseXml;
        this.parseTextData = parseTextData;
        this.resolveNameSpace = resolveNameSpace;
        this.buildAttributesMap = buildAttributesMap;
        this.isItStopNode = isItStopNode;
        this.replaceEntitiesValue = replaceEntitiesValue;
        this.readStopNodeData = readStopNodeData;
        this.saveTextToParentTag = saveTextToParentTag;
        this.addChild = addChild;
      }
    };
    function addExternalEntities(externalEntities) {
      const entKeys = Object.keys(externalEntities);
      for (let i2 = 0; i2 < entKeys.length; i2++) {
        const ent = entKeys[i2];
        this.lastEntities[ent] = {
          regex: new RegExp("&" + ent + ";", "g"),
          val: externalEntities[ent]
        };
      }
    }
    function parseTextData(val2, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
      if (val2 !== void 0) {
        if (this.options.trimValues && !dontTrim) {
          val2 = val2.trim();
        }
        if (val2.length > 0) {
          if (!escapeEntities) val2 = this.replaceEntitiesValue(val2);
          const newval = this.options.tagValueProcessor(tagName, val2, jPath, hasAttributes, isLeafNode);
          if (newval === null || newval === void 0) {
            return val2;
          } else if (typeof newval !== typeof val2 || newval !== val2) {
            return newval;
          } else if (this.options.trimValues) {
            return parseValue(val2, this.options.parseTagValue, this.options.numberParseOptions);
          } else {
            const trimmedVal = val2.trim();
            if (trimmedVal === val2) {
              return parseValue(val2, this.options.parseTagValue, this.options.numberParseOptions);
            } else {
              return val2;
            }
          }
        }
      }
    }
    function resolveNameSpace(tagname) {
      if (this.options.removeNSPrefix) {
        const tags = tagname.split(":");
        const prefix = tagname.charAt(0) === "/" ? "/" : "";
        if (tags[0] === "xmlns") {
          return "";
        }
        if (tags.length === 2) {
          tagname = prefix + tags[1];
        }
      }
      return tagname;
    }
    var attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
    function buildAttributesMap(attrStr, jPath, tagName) {
      if (!this.options.ignoreAttributes && typeof attrStr === "string") {
        const matches = util.getAllMatches(attrStr, attrsRegx);
        const len = matches.length;
        const attrs = {};
        for (let i2 = 0; i2 < len; i2++) {
          const attrName = this.resolveNameSpace(matches[i2][1]);
          let oldVal = matches[i2][4];
          let aName = this.options.attributeNamePrefix + attrName;
          if (attrName.length) {
            if (this.options.transformAttributeName) {
              aName = this.options.transformAttributeName(aName);
            }
            if (aName === "__proto__") aName = "#__proto__";
            if (oldVal !== void 0) {
              if (this.options.trimValues) {
                oldVal = oldVal.trim();
              }
              oldVal = this.replaceEntitiesValue(oldVal);
              const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPath);
              if (newVal === null || newVal === void 0) {
                attrs[aName] = oldVal;
              } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
                attrs[aName] = newVal;
              } else {
                attrs[aName] = parseValue(
                  oldVal,
                  this.options.parseAttributeValue,
                  this.options.numberParseOptions
                );
              }
            } else if (this.options.allowBooleanAttributes) {
              attrs[aName] = true;
            }
          }
        }
        if (!Object.keys(attrs).length) {
          return;
        }
        if (this.options.attributesGroupName) {
          const attrCollection = {};
          attrCollection[this.options.attributesGroupName] = attrs;
          return attrCollection;
        }
        return attrs;
      }
    }
    var parseXml = function(xmlData) {
      xmlData = xmlData.replace(/\r\n?/g, "\n");
      const xmlObj = new xmlNode("!xml");
      let currentNode = xmlObj;
      let textData = "";
      let jPath = "";
      for (let i2 = 0; i2 < xmlData.length; i2++) {
        const ch2 = xmlData[i2];
        if (ch2 === "<") {
          if (xmlData[i2 + 1] === "/") {
            const closeIndex = findClosingIndex(xmlData, ">", i2, "Closing Tag is not closed.");
            let tagName = xmlData.substring(i2 + 2, closeIndex).trim();
            if (this.options.removeNSPrefix) {
              const colonIndex = tagName.indexOf(":");
              if (colonIndex !== -1) {
                tagName = tagName.substr(colonIndex + 1);
              }
            }
            if (this.options.transformTagName) {
              tagName = this.options.transformTagName(tagName);
            }
            if (currentNode) {
              textData = this.saveTextToParentTag(textData, currentNode, jPath);
            }
            const lastTagName = jPath.substring(jPath.lastIndexOf(".") + 1);
            if (tagName && this.options.unpairedTags.indexOf(tagName) !== -1) {
              throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
            }
            let propIndex = 0;
            if (lastTagName && this.options.unpairedTags.indexOf(lastTagName) !== -1) {
              propIndex = jPath.lastIndexOf(".", jPath.lastIndexOf(".") - 1);
              this.tagsNodeStack.pop();
            } else {
              propIndex = jPath.lastIndexOf(".");
            }
            jPath = jPath.substring(0, propIndex);
            currentNode = this.tagsNodeStack.pop();
            textData = "";
            i2 = closeIndex;
          } else if (xmlData[i2 + 1] === "?") {
            let tagData = readTagExp(xmlData, i2, false, "?>");
            if (!tagData) throw new Error("Pi Tag is not closed.");
            textData = this.saveTextToParentTag(textData, currentNode, jPath);
            if (this.options.ignoreDeclaration && tagData.tagName === "?xml" || this.options.ignorePiTags) {
            } else {
              const childNode = new xmlNode(tagData.tagName);
              childNode.add(this.options.textNodeName, "");
              if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent) {
                childNode[":@"] = this.buildAttributesMap(tagData.tagExp, jPath, tagData.tagName);
              }
              this.addChild(currentNode, childNode, jPath);
            }
            i2 = tagData.closeIndex + 1;
          } else if (xmlData.substr(i2 + 1, 3) === "!--") {
            const endIndex = findClosingIndex(xmlData, "-->", i2 + 4, "Comment is not closed.");
            if (this.options.commentPropName) {
              const comment = xmlData.substring(i2 + 4, endIndex - 2);
              textData = this.saveTextToParentTag(textData, currentNode, jPath);
              currentNode.add(this.options.commentPropName, [{ [this.options.textNodeName]: comment }]);
            }
            i2 = endIndex;
          } else if (xmlData.substr(i2 + 1, 2) === "!D") {
            const result = readDocType(xmlData, i2);
            this.docTypeEntities = result.entities;
            i2 = result.i;
          } else if (xmlData.substr(i2 + 1, 2) === "![") {
            const closeIndex = findClosingIndex(xmlData, "]]>", i2, "CDATA is not closed.") - 2;
            const tagExp = xmlData.substring(i2 + 9, closeIndex);
            textData = this.saveTextToParentTag(textData, currentNode, jPath);
            if (this.options.cdataPropName) {
              currentNode.add(this.options.cdataPropName, [{ [this.options.textNodeName]: tagExp }]);
            } else {
              let val2 = this.parseTextData(tagExp, currentNode.tagname, jPath, true, false, true);
              if (val2 == void 0) val2 = "";
              currentNode.add(this.options.textNodeName, val2);
            }
            i2 = closeIndex + 2;
          } else {
            let result = readTagExp(xmlData, i2, this.options.removeNSPrefix);
            let tagName = result.tagName;
            let tagExp = result.tagExp;
            let attrExpPresent = result.attrExpPresent;
            let closeIndex = result.closeIndex;
            if (this.options.transformTagName) {
              tagName = this.options.transformTagName(tagName);
            }
            if (currentNode && textData) {
              if (currentNode.tagname !== "!xml") {
                textData = this.saveTextToParentTag(textData, currentNode, jPath, false);
              }
            }
            const lastTag = currentNode;
            if (lastTag && this.options.unpairedTags.indexOf(lastTag.tagname) !== -1) {
              currentNode = this.tagsNodeStack.pop();
              jPath = jPath.substring(0, jPath.lastIndexOf("."));
            }
            if (tagName !== xmlObj.tagname) {
              jPath += jPath ? "." + tagName : tagName;
            }
            if (this.isItStopNode(this.options.stopNodes, jPath, tagName)) {
              let tagContent = "";
              if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
                i2 = result.closeIndex;
              } else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
                i2 = result.closeIndex;
              } else {
                const result2 = this.readStopNodeData(xmlData, tagName, closeIndex + 1);
                if (!result2) throw new Error(`Unexpected end of ${tagName}`);
                i2 = result2.i;
                tagContent = result2.tagContent;
              }
              const childNode = new xmlNode(tagName);
              if (tagName !== tagExp && attrExpPresent) {
                childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
              }
              if (tagContent) {
                tagContent = this.parseTextData(tagContent, tagName, jPath, true, attrExpPresent, true, true);
              }
              jPath = jPath.substr(0, jPath.lastIndexOf("."));
              childNode.add(this.options.textNodeName, tagContent);
              this.addChild(currentNode, childNode, jPath);
            } else {
              if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
                if (tagName[tagName.length - 1] === "/") {
                  tagName = tagName.substr(0, tagName.length - 1);
                  tagExp = tagName;
                } else {
                  tagExp = tagExp.substr(0, tagExp.length - 1);
                }
                if (this.options.transformTagName) {
                  tagName = this.options.transformTagName(tagName);
                }
                const childNode = new xmlNode(tagName);
                if (tagName !== tagExp && attrExpPresent) {
                  childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
                }
                this.addChild(currentNode, childNode, jPath);
                jPath = jPath.substr(0, jPath.lastIndexOf("."));
              } else {
                const childNode = new xmlNode(tagName);
                this.tagsNodeStack.push(currentNode);
                if (tagName !== tagExp && attrExpPresent) {
                  childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
                }
                this.addChild(currentNode, childNode, jPath);
                currentNode = childNode;
              }
              textData = "";
              i2 = closeIndex;
            }
          }
        } else {
          textData += xmlData[i2];
        }
      }
      return xmlObj.child;
    };
    function addChild(currentNode, childNode, jPath) {
      const result = this.options.updateTag(childNode.tagname, jPath, childNode[":@"]);
      if (result === false) {
      } else if (typeof result === "string") {
        childNode.tagname = result;
        currentNode.addChild(childNode);
      } else {
        currentNode.addChild(childNode);
      }
    }
    var replaceEntitiesValue = function(val2) {
      if (this.options.processEntities) {
        for (let entityName2 in this.docTypeEntities) {
          const entity = this.docTypeEntities[entityName2];
          val2 = val2.replace(entity.regx, entity.val);
        }
        for (let entityName2 in this.lastEntities) {
          const entity = this.lastEntities[entityName2];
          val2 = val2.replace(entity.regex, entity.val);
        }
        if (this.options.htmlEntities) {
          for (let entityName2 in this.htmlEntities) {
            const entity = this.htmlEntities[entityName2];
            val2 = val2.replace(entity.regex, entity.val);
          }
        }
        val2 = val2.replace(this.ampEntity.regex, this.ampEntity.val);
      }
      return val2;
    };
    function saveTextToParentTag(textData, currentNode, jPath, isLeafNode) {
      if (textData) {
        if (isLeafNode === void 0) isLeafNode = Object.keys(currentNode.child).length === 0;
        textData = this.parseTextData(
          textData,
          currentNode.tagname,
          jPath,
          false,
          currentNode[":@"] ? Object.keys(currentNode[":@"]).length !== 0 : false,
          isLeafNode
        );
        if (textData !== void 0 && textData !== "")
          currentNode.add(this.options.textNodeName, textData);
        textData = "";
      }
      return textData;
    }
    function isItStopNode(stopNodes, jPath, currentTagName) {
      const allNodesExp = "*." + currentTagName;
      for (const stopNodePath in stopNodes) {
        const stopNodeExp = stopNodes[stopNodePath];
        if (allNodesExp === stopNodeExp || jPath === stopNodeExp) return true;
      }
      return false;
    }
    function tagExpWithClosingIndex(xmlData, i2, closingChar = ">") {
      let attrBoundary;
      let tagExp = "";
      for (let index = i2; index < xmlData.length; index++) {
        let ch2 = xmlData[index];
        if (attrBoundary) {
          if (ch2 === attrBoundary) attrBoundary = "";
        } else if (ch2 === '"' || ch2 === "'") {
          attrBoundary = ch2;
        } else if (ch2 === closingChar[0]) {
          if (closingChar[1]) {
            if (xmlData[index + 1] === closingChar[1]) {
              return {
                data: tagExp,
                index
              };
            }
          } else {
            return {
              data: tagExp,
              index
            };
          }
        } else if (ch2 === "	") {
          ch2 = " ";
        }
        tagExp += ch2;
      }
    }
    function findClosingIndex(xmlData, str, i2, errMsg) {
      const closingIndex = xmlData.indexOf(str, i2);
      if (closingIndex === -1) {
        throw new Error(errMsg);
      } else {
        return closingIndex + str.length - 1;
      }
    }
    function readTagExp(xmlData, i2, removeNSPrefix, closingChar = ">") {
      const result = tagExpWithClosingIndex(xmlData, i2 + 1, closingChar);
      if (!result) return;
      let tagExp = result.data;
      const closeIndex = result.index;
      const separatorIndex = tagExp.search(/\s/);
      let tagName = tagExp;
      let attrExpPresent = true;
      if (separatorIndex !== -1) {
        tagName = tagExp.substr(0, separatorIndex).replace(/\s\s*$/, "");
        tagExp = tagExp.substr(separatorIndex + 1);
      }
      if (removeNSPrefix) {
        const colonIndex = tagName.indexOf(":");
        if (colonIndex !== -1) {
          tagName = tagName.substr(colonIndex + 1);
          attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
        }
      }
      return {
        tagName,
        tagExp,
        closeIndex,
        attrExpPresent
      };
    }
    function readStopNodeData(xmlData, tagName, i2) {
      const startIndex = i2;
      let openTagCount = 1;
      for (; i2 < xmlData.length; i2++) {
        if (xmlData[i2] === "<") {
          if (xmlData[i2 + 1] === "/") {
            const closeIndex = findClosingIndex(xmlData, ">", i2, `${tagName} is not closed`);
            let closeTagName = xmlData.substring(i2 + 2, closeIndex).trim();
            if (closeTagName === tagName) {
              openTagCount--;
              if (openTagCount === 0) {
                return {
                  tagContent: xmlData.substring(startIndex, i2),
                  i: closeIndex
                };
              }
            }
            i2 = closeIndex;
          } else if (xmlData[i2 + 1] === "?") {
            const closeIndex = findClosingIndex(xmlData, "?>", i2 + 1, "StopNode is not closed.");
            i2 = closeIndex;
          } else if (xmlData.substr(i2 + 1, 3) === "!--") {
            const closeIndex = findClosingIndex(xmlData, "-->", i2 + 3, "StopNode is not closed.");
            i2 = closeIndex;
          } else if (xmlData.substr(i2 + 1, 2) === "![") {
            const closeIndex = findClosingIndex(xmlData, "]]>", i2, "StopNode is not closed.") - 2;
            i2 = closeIndex;
          } else {
            const tagData = readTagExp(xmlData, i2, ">");
            if (tagData) {
              const openTagName = tagData && tagData.tagName;
              if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
                openTagCount++;
              }
              i2 = tagData.closeIndex;
            }
          }
        }
      }
    }
    function parseValue(val2, shouldParse, options) {
      if (shouldParse && typeof val2 === "string") {
        const newval = val2.trim();
        if (newval === "true") return true;
        else if (newval === "false") return false;
        else return toNumber(val2, options);
      } else {
        if (util.isExist(val2)) {
          return val2;
        } else {
          return "";
        }
      }
    }
    module.exports = OrderedObjParser;
  }
});

// node_modules/fast-xml-parser/src/xmlparser/node2json.js
var require_node2json = __commonJS({
  "node_modules/fast-xml-parser/src/xmlparser/node2json.js"(exports) {
    "use strict";
    function prettify(node, options) {
      return compress(node, options);
    }
    function compress(arr, options, jPath) {
      let text;
      const compressedObj = {};
      for (let i2 = 0; i2 < arr.length; i2++) {
        const tagObj = arr[i2];
        const property = propName(tagObj);
        let newJpath = "";
        if (jPath === void 0) newJpath = property;
        else newJpath = jPath + "." + property;
        if (property === options.textNodeName) {
          if (text === void 0) text = tagObj[property];
          else text += "" + tagObj[property];
        } else if (property === void 0) {
          continue;
        } else if (tagObj[property]) {
          let val2 = compress(tagObj[property], options, newJpath);
          const isLeaf = isLeafTag(val2, options);
          if (tagObj[":@"]) {
            assignAttributes(val2, tagObj[":@"], newJpath, options);
          } else if (Object.keys(val2).length === 1 && val2[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
            val2 = val2[options.textNodeName];
          } else if (Object.keys(val2).length === 0) {
            if (options.alwaysCreateTextNode) val2[options.textNodeName] = "";
            else val2 = "";
          }
          if (compressedObj[property] !== void 0 && compressedObj.hasOwnProperty(property)) {
            if (!Array.isArray(compressedObj[property])) {
              compressedObj[property] = [compressedObj[property]];
            }
            compressedObj[property].push(val2);
          } else {
            if (options.isArray(property, newJpath, isLeaf)) {
              compressedObj[property] = [val2];
            } else {
              compressedObj[property] = val2;
            }
          }
        }
      }
      if (typeof text === "string") {
        if (text.length > 0) compressedObj[options.textNodeName] = text;
      } else if (text !== void 0) compressedObj[options.textNodeName] = text;
      return compressedObj;
    }
    function propName(obj) {
      const keys = Object.keys(obj);
      for (let i2 = 0; i2 < keys.length; i2++) {
        const key = keys[i2];
        if (key !== ":@") return key;
      }
    }
    function assignAttributes(obj, attrMap, jpath, options) {
      if (attrMap) {
        const keys = Object.keys(attrMap);
        const len = keys.length;
        for (let i2 = 0; i2 < len; i2++) {
          const atrrName = keys[i2];
          if (options.isArray(atrrName, jpath + "." + atrrName, true, true)) {
            obj[atrrName] = [attrMap[atrrName]];
          } else {
            obj[atrrName] = attrMap[atrrName];
          }
        }
      }
    }
    function isLeafTag(obj, options) {
      const { textNodeName } = options;
      const propCount = Object.keys(obj).length;
      if (propCount === 0) {
        return true;
      }
      if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
        return true;
      }
      return false;
    }
    exports.prettify = prettify;
  }
});

// node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
var require_XMLParser = __commonJS({
  "node_modules/fast-xml-parser/src/xmlparser/XMLParser.js"(exports, module) {
    var { buildOptions } = require_OptionsBuilder();
    var OrderedObjParser = require_OrderedObjParser();
    var { prettify } = require_node2json();
    var validator = require_validator();
    var XMLParser2 = class {
      constructor(options) {
        this.externalEntities = {};
        this.options = buildOptions(options);
      }
      /**
       * Parse XML dats to JS object 
       * @param {string|Buffer} xmlData 
       * @param {boolean|Object} validationOption 
       */
      parse(xmlData, validationOption) {
        if (typeof xmlData === "string") {
        } else if (xmlData.toString) {
          xmlData = xmlData.toString();
        } else {
          throw new Error("XML data is accepted in String or Bytes[] form.");
        }
        if (validationOption) {
          if (validationOption === true) validationOption = {};
          const result = validator.validate(xmlData, validationOption);
          if (result !== true) {
            throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
          }
        }
        const orderedObjParser = new OrderedObjParser(this.options);
        orderedObjParser.addExternalEntities(this.externalEntities);
        const orderedResult = orderedObjParser.parseXml(xmlData);
        if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
        else return prettify(orderedResult, this.options);
      }
      /**
       * Add Entity which is not by default supported by this library
       * @param {string} key 
       * @param {string} value 
       */
      addEntity(key, value) {
        if (value.indexOf("&") !== -1) {
          throw new Error("Entity value can't have '&'");
        } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
          throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
        } else if (value === "&") {
          throw new Error("An entity with value '&' is not permitted");
        } else {
          this.externalEntities[key] = value;
        }
      }
    };
    module.exports = XMLParser2;
  }
});

// node_modules/fast-xml-parser/src/xmlbuilder/orderedJs2Xml.js
var require_orderedJs2Xml = __commonJS({
  "node_modules/fast-xml-parser/src/xmlbuilder/orderedJs2Xml.js"(exports, module) {
    var EOL = "\n";
    function toXml(jArray, options) {
      let indentation = "";
      if (options.format && options.indentBy.length > 0) {
        indentation = EOL;
      }
      return arrToStr(jArray, options, "", indentation);
    }
    function arrToStr(arr, options, jPath, indentation) {
      let xmlStr = "";
      let isPreviousElementTag = false;
      for (let i2 = 0; i2 < arr.length; i2++) {
        const tagObj = arr[i2];
        const tagName = propName(tagObj);
        let newJPath = "";
        if (jPath.length === 0) newJPath = tagName;
        else newJPath = `${jPath}.${tagName}`;
        if (tagName === options.textNodeName) {
          let tagText = tagObj[tagName];
          if (!isStopNode(newJPath, options)) {
            tagText = options.tagValueProcessor(tagName, tagText);
            tagText = replaceEntitiesValue(tagText, options);
          }
          if (isPreviousElementTag) {
            xmlStr += indentation;
          }
          xmlStr += tagText;
          isPreviousElementTag = false;
          continue;
        } else if (tagName === options.cdataPropName) {
          if (isPreviousElementTag) {
            xmlStr += indentation;
          }
          xmlStr += `<![CDATA[${tagObj[tagName][0][options.textNodeName]}]]>`;
          isPreviousElementTag = false;
          continue;
        } else if (tagName === options.commentPropName) {
          xmlStr += indentation + `<!--${tagObj[tagName][0][options.textNodeName]}-->`;
          isPreviousElementTag = true;
          continue;
        } else if (tagName[0] === "?") {
          const attStr2 = attr_to_str(tagObj[":@"], options);
          const tempInd = tagName === "?xml" ? "" : indentation;
          let piTextNodeName = tagObj[tagName][0][options.textNodeName];
          piTextNodeName = piTextNodeName.length !== 0 ? " " + piTextNodeName : "";
          xmlStr += tempInd + `<${tagName}${piTextNodeName}${attStr2}?>`;
          isPreviousElementTag = true;
          continue;
        }
        let newIdentation = indentation;
        if (newIdentation !== "") {
          newIdentation += options.indentBy;
        }
        const attStr = attr_to_str(tagObj[":@"], options);
        const tagStart = indentation + `<${tagName}${attStr}`;
        const tagValue = arrToStr(tagObj[tagName], options, newJPath, newIdentation);
        if (options.unpairedTags.indexOf(tagName) !== -1) {
          if (options.suppressUnpairedNode) xmlStr += tagStart + ">";
          else xmlStr += tagStart + "/>";
        } else if ((!tagValue || tagValue.length === 0) && options.suppressEmptyNode) {
          xmlStr += tagStart + "/>";
        } else if (tagValue && tagValue.endsWith(">")) {
          xmlStr += tagStart + `>${tagValue}${indentation}</${tagName}>`;
        } else {
          xmlStr += tagStart + ">";
          if (tagValue && indentation !== "" && (tagValue.includes("/>") || tagValue.includes("</"))) {
            xmlStr += indentation + options.indentBy + tagValue + indentation;
          } else {
            xmlStr += tagValue;
          }
          xmlStr += `</${tagName}>`;
        }
        isPreviousElementTag = true;
      }
      return xmlStr;
    }
    function propName(obj) {
      const keys = Object.keys(obj);
      for (let i2 = 0; i2 < keys.length; i2++) {
        const key = keys[i2];
        if (key !== ":@") return key;
      }
    }
    function attr_to_str(attrMap, options) {
      let attrStr = "";
      if (attrMap && !options.ignoreAttributes) {
        for (let attr in attrMap) {
          let attrVal = options.attributeValueProcessor(attr, attrMap[attr]);
          attrVal = replaceEntitiesValue(attrVal, options);
          if (attrVal === true && options.suppressBooleanAttributes) {
            attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}`;
          } else {
            attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}="${attrVal}"`;
          }
        }
      }
      return attrStr;
    }
    function isStopNode(jPath, options) {
      jPath = jPath.substr(0, jPath.length - options.textNodeName.length - 1);
      let tagName = jPath.substr(jPath.lastIndexOf(".") + 1);
      for (let index in options.stopNodes) {
        if (options.stopNodes[index] === jPath || options.stopNodes[index] === "*." + tagName) return true;
      }
      return false;
    }
    function replaceEntitiesValue(textValue, options) {
      if (textValue && textValue.length > 0 && options.processEntities) {
        for (let i2 = 0; i2 < options.entities.length; i2++) {
          const entity = options.entities[i2];
          textValue = textValue.replace(entity.regex, entity.val);
        }
      }
      return textValue;
    }
    module.exports = toXml;
  }
});

// node_modules/fast-xml-parser/src/xmlbuilder/json2xml.js
var require_json2xml = __commonJS({
  "node_modules/fast-xml-parser/src/xmlbuilder/json2xml.js"(exports, module) {
    "use strict";
    var buildFromOrderedJs = require_orderedJs2Xml();
    var defaultOptions = {
      attributeNamePrefix: "@_",
      attributesGroupName: false,
      textNodeName: "#text",
      ignoreAttributes: true,
      cdataPropName: false,
      format: false,
      indentBy: "  ",
      suppressEmptyNode: false,
      suppressUnpairedNode: true,
      suppressBooleanAttributes: true,
      tagValueProcessor: function(key, a2) {
        return a2;
      },
      attributeValueProcessor: function(attrName, a2) {
        return a2;
      },
      preserveOrder: false,
      commentPropName: false,
      unpairedTags: [],
      entities: [
        { regex: new RegExp("&", "g"), val: "&amp;" },
        //it must be on top
        { regex: new RegExp(">", "g"), val: "&gt;" },
        { regex: new RegExp("<", "g"), val: "&lt;" },
        { regex: new RegExp("'", "g"), val: "&apos;" },
        { regex: new RegExp('"', "g"), val: "&quot;" }
      ],
      processEntities: true,
      stopNodes: [],
      // transformTagName: false,
      // transformAttributeName: false,
      oneListGroup: false
    };
    function Builder(options) {
      this.options = Object.assign({}, defaultOptions, options);
      if (this.options.ignoreAttributes || this.options.attributesGroupName) {
        this.isAttribute = function() {
          return false;
        };
      } else {
        this.attrPrefixLen = this.options.attributeNamePrefix.length;
        this.isAttribute = isAttribute;
      }
      this.processTextOrObjNode = processTextOrObjNode;
      if (this.options.format) {
        this.indentate = indentate;
        this.tagEndChar = ">\n";
        this.newLine = "\n";
      } else {
        this.indentate = function() {
          return "";
        };
        this.tagEndChar = ">";
        this.newLine = "";
      }
    }
    Builder.prototype.build = function(jObj) {
      if (this.options.preserveOrder) {
        return buildFromOrderedJs(jObj, this.options);
      } else {
        if (Array.isArray(jObj) && this.options.arrayNodeName && this.options.arrayNodeName.length > 1) {
          jObj = {
            [this.options.arrayNodeName]: jObj
          };
        }
        return this.j2x(jObj, 0).val;
      }
    };
    Builder.prototype.j2x = function(jObj, level) {
      let attrStr = "";
      let val2 = "";
      for (let key in jObj) {
        if (typeof jObj[key] === "undefined") {
        } else if (jObj[key] === null) {
          if (key[0] === "?") val2 += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
          else val2 += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
        } else if (jObj[key] instanceof Date) {
          val2 += this.buildTextValNode(jObj[key], key, "", level);
        } else if (typeof jObj[key] !== "object") {
          const attr = this.isAttribute(key);
          if (attr) {
            attrStr += this.buildAttrPairStr(attr, "" + jObj[key]);
          } else {
            if (key === this.options.textNodeName) {
              let newval = this.options.tagValueProcessor(key, "" + jObj[key]);
              val2 += this.replaceEntitiesValue(newval);
            } else {
              val2 += this.buildTextValNode(jObj[key], key, "", level);
            }
          }
        } else if (Array.isArray(jObj[key])) {
          const arrLen = jObj[key].length;
          let listTagVal = "";
          for (let j2 = 0; j2 < arrLen; j2++) {
            const item = jObj[key][j2];
            if (typeof item === "undefined") {
            } else if (item === null) {
              if (key[0] === "?") val2 += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
              else val2 += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
            } else if (typeof item === "object") {
              if (this.options.oneListGroup) {
                listTagVal += this.j2x(item, level + 1).val;
              } else {
                listTagVal += this.processTextOrObjNode(item, key, level);
              }
            } else {
              listTagVal += this.buildTextValNode(item, key, "", level);
            }
          }
          if (this.options.oneListGroup) {
            listTagVal = this.buildObjectNode(listTagVal, key, "", level);
          }
          val2 += listTagVal;
        } else {
          if (this.options.attributesGroupName && key === this.options.attributesGroupName) {
            const Ks = Object.keys(jObj[key]);
            const L2 = Ks.length;
            for (let j2 = 0; j2 < L2; j2++) {
              attrStr += this.buildAttrPairStr(Ks[j2], "" + jObj[key][Ks[j2]]);
            }
          } else {
            val2 += this.processTextOrObjNode(jObj[key], key, level);
          }
        }
      }
      return { attrStr, val: val2 };
    };
    Builder.prototype.buildAttrPairStr = function(attrName, val2) {
      val2 = this.options.attributeValueProcessor(attrName, "" + val2);
      val2 = this.replaceEntitiesValue(val2);
      if (this.options.suppressBooleanAttributes && val2 === "true") {
        return " " + attrName;
      } else return " " + attrName + '="' + val2 + '"';
    };
    function processTextOrObjNode(object, key, level) {
      const result = this.j2x(object, level + 1);
      if (object[this.options.textNodeName] !== void 0 && Object.keys(object).length === 1) {
        return this.buildTextValNode(object[this.options.textNodeName], key, result.attrStr, level);
      } else {
        return this.buildObjectNode(result.val, key, result.attrStr, level);
      }
    }
    Builder.prototype.buildObjectNode = function(val2, key, attrStr, level) {
      if (val2 === "") {
        if (key[0] === "?") return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
        else {
          return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
        }
      } else {
        let tagEndExp = "</" + key + this.tagEndChar;
        let piClosingChar = "";
        if (key[0] === "?") {
          piClosingChar = "?";
          tagEndExp = "";
        }
        if (attrStr && val2.indexOf("<") === -1) {
          return this.indentate(level) + "<" + key + attrStr + piClosingChar + ">" + val2 + tagEndExp;
        } else if (this.options.commentPropName !== false && key === this.options.commentPropName && piClosingChar.length === 0) {
          return this.indentate(level) + `<!--${val2}-->` + this.newLine;
        } else {
          return this.indentate(level) + "<" + key + attrStr + piClosingChar + this.tagEndChar + val2 + this.indentate(level) + tagEndExp;
        }
      }
    };
    Builder.prototype.closeTag = function(key) {
      let closeTag = "";
      if (this.options.unpairedTags.indexOf(key) !== -1) {
        if (!this.options.suppressUnpairedNode) closeTag = "/";
      } else if (this.options.suppressEmptyNode) {
        closeTag = "/";
      } else {
        closeTag = `></${key}`;
      }
      return closeTag;
    };
    Builder.prototype.buildTextValNode = function(val2, key, attrStr, level) {
      if (this.options.cdataPropName !== false && key === this.options.cdataPropName) {
        return this.indentate(level) + `<![CDATA[${val2}]]>` + this.newLine;
      } else if (this.options.commentPropName !== false && key === this.options.commentPropName) {
        return this.indentate(level) + `<!--${val2}-->` + this.newLine;
      } else if (key[0] === "?") {
        return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
      } else {
        let textValue = this.options.tagValueProcessor(key, val2);
        textValue = this.replaceEntitiesValue(textValue);
        if (textValue === "") {
          return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
        } else {
          return this.indentate(level) + "<" + key + attrStr + ">" + textValue + "</" + key + this.tagEndChar;
        }
      }
    };
    Builder.prototype.replaceEntitiesValue = function(textValue) {
      if (textValue && textValue.length > 0 && this.options.processEntities) {
        for (let i2 = 0; i2 < this.options.entities.length; i2++) {
          const entity = this.options.entities[i2];
          textValue = textValue.replace(entity.regex, entity.val);
        }
      }
      return textValue;
    };
    function indentate(level) {
      return this.options.indentBy.repeat(level);
    }
    function isAttribute(name) {
      if (name.startsWith(this.options.attributeNamePrefix)) {
        return name.substr(this.attrPrefixLen);
      } else {
        return false;
      }
    }
    module.exports = Builder;
  }
});

// node_modules/fast-xml-parser/src/fxp.js
var require_fxp = __commonJS({
  "node_modules/fast-xml-parser/src/fxp.js"(exports, module) {
    "use strict";
    var validator = require_validator();
    var XMLParser2 = require_XMLParser();
    var XMLBuilder = require_json2xml();
    module.exports = {
      XMLParser: XMLParser2,
      XMLValidator: validator,
      XMLBuilder
    };
  }
});

// node_modules/@aws-crypto/sha1-browser/node_modules/tslib/tslib.es6.js
var tslib_es6_exports = {};
__export(tslib_es6_exports, {
  __assign: () => __assign,
  __asyncDelegator: () => __asyncDelegator,
  __asyncGenerator: () => __asyncGenerator,
  __asyncValues: () => __asyncValues,
  __await: () => __await,
  __awaiter: () => __awaiter,
  __classPrivateFieldGet: () => __classPrivateFieldGet,
  __classPrivateFieldSet: () => __classPrivateFieldSet,
  __createBinding: () => __createBinding,
  __decorate: () => __decorate,
  __exportStar: () => __exportStar,
  __extends: () => __extends,
  __generator: () => __generator,
  __importDefault: () => __importDefault,
  __importStar: () => __importStar,
  __makeTemplateObject: () => __makeTemplateObject,
  __metadata: () => __metadata,
  __param: () => __param,
  __read: () => __read,
  __rest: () => __rest,
  __spread: () => __spread,
  __spreadArrays: () => __spreadArrays,
  __values: () => __values
});
function __extends(d2, b2) {
  extendStatics(d2, b2);
  function __() {
    this.constructor = d2;
  }
  d2.prototype = b2 === null ? Object.create(b2) : (__.prototype = b2.prototype, new __());
}
function __rest(s2, e2) {
  var t2 = {};
  for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2) && e2.indexOf(p2) < 0)
    t2[p2] = s2[p2];
  if (s2 != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i2 = 0, p2 = Object.getOwnPropertySymbols(s2); i2 < p2.length; i2++) {
      if (e2.indexOf(p2[i2]) < 0 && Object.prototype.propertyIsEnumerable.call(s2, p2[i2]))
        t2[p2[i2]] = s2[p2[i2]];
    }
  return t2;
}
function __decorate(decorators, target, key, desc) {
  var c2 = arguments.length, r2 = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d2;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r2 = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d2 = decorators[i2]) r2 = (c2 < 3 ? d2(r2) : c2 > 3 ? d2(target, key, r2) : d2(target, key)) || r2;
  return c2 > 3 && r2 && Object.defineProperty(target, key, r2), r2;
}
function __param(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __metadata(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter(thisArg, _arguments, P2, generator) {
  function adopt(value) {
    return value instanceof P2 ? value : new P2(function(resolve) {
      resolve(value);
    });
  }
  return new (P2 || (P2 = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e2) {
        reject(e2);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e2) {
        reject(e2);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t2[0] & 1) throw t2[1];
    return t2[1];
  }, trys: [], ops: [] }, f2, y2, t2, g2;
  return g2 = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g2[Symbol.iterator] = function() {
    return this;
  }), g2;
  function verb(n2) {
    return function(v2) {
      return step([n2, v2]);
    };
  }
  function step(op) {
    if (f2) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f2 = 1, y2 && (t2 = op[0] & 2 ? y2["return"] : op[0] ? y2["throw"] || ((t2 = y2["return"]) && t2.call(y2), 0) : y2.next) && !(t2 = t2.call(y2, op[1])).done) return t2;
      if (y2 = 0, t2) op = [op[0] & 2, t2.value];
      switch (op[0]) {
        case 0:
        case 1:
          t2 = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y2 = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t2 = _.trys, t2 = t2.length > 0 && t2[t2.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t2 || op[1] > t2[0] && op[1] < t2[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t2[1]) {
            _.label = t2[1];
            t2 = op;
            break;
          }
          if (t2 && _.label < t2[2]) {
            _.label = t2[2];
            _.ops.push(op);
            break;
          }
          if (t2[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e2) {
      op = [6, e2];
      y2 = 0;
    } finally {
      f2 = t2 = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __createBinding(o2, m2, k2, k22) {
  if (k22 === void 0) k22 = k2;
  o2[k22] = m2[k2];
}
function __exportStar(m2, exports) {
  for (var p2 in m2) if (p2 !== "default" && !exports.hasOwnProperty(p2)) exports[p2] = m2[p2];
}
function __values(o2) {
  var s2 = typeof Symbol === "function" && Symbol.iterator, m2 = s2 && o2[s2], i2 = 0;
  if (m2) return m2.call(o2);
  if (o2 && typeof o2.length === "number") return {
    next: function() {
      if (o2 && i2 >= o2.length) o2 = void 0;
      return { value: o2 && o2[i2++], done: !o2 };
    }
  };
  throw new TypeError(s2 ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read(o2, n2) {
  var m2 = typeof Symbol === "function" && o2[Symbol.iterator];
  if (!m2) return o2;
  var i2 = m2.call(o2), r2, ar2 = [], e2;
  try {
    while ((n2 === void 0 || n2-- > 0) && !(r2 = i2.next()).done) ar2.push(r2.value);
  } catch (error) {
    e2 = { error };
  } finally {
    try {
      if (r2 && !r2.done && (m2 = i2["return"])) m2.call(i2);
    } finally {
      if (e2) throw e2.error;
    }
  }
  return ar2;
}
function __spread() {
  for (var ar2 = [], i2 = 0; i2 < arguments.length; i2++)
    ar2 = ar2.concat(__read(arguments[i2]));
  return ar2;
}
function __spreadArrays() {
  for (var s2 = 0, i2 = 0, il = arguments.length; i2 < il; i2++) s2 += arguments[i2].length;
  for (var r2 = Array(s2), k2 = 0, i2 = 0; i2 < il; i2++)
    for (var a2 = arguments[i2], j2 = 0, jl = a2.length; j2 < jl; j2++, k2++)
      r2[k2] = a2[j2];
  return r2;
}
function __await(v2) {
  return this instanceof __await ? (this.v = v2, this) : new __await(v2);
}
function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g2 = generator.apply(thisArg, _arguments || []), i2, q2 = [];
  return i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2;
  function verb(n2) {
    if (g2[n2]) i2[n2] = function(v2) {
      return new Promise(function(a2, b2) {
        q2.push([n2, v2, a2, b2]) > 1 || resume(n2, v2);
      });
    };
  }
  function resume(n2, v2) {
    try {
      step(g2[n2](v2));
    } catch (e2) {
      settle(q2[0][3], e2);
    }
  }
  function step(r2) {
    r2.value instanceof __await ? Promise.resolve(r2.value.v).then(fulfill, reject) : settle(q2[0][2], r2);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f2, v2) {
    if (f2(v2), q2.shift(), q2.length) resume(q2[0][0], q2[0][1]);
  }
}
function __asyncDelegator(o2) {
  var i2, p2;
  return i2 = {}, verb("next"), verb("throw", function(e2) {
    throw e2;
  }), verb("return"), i2[Symbol.iterator] = function() {
    return this;
  }, i2;
  function verb(n2, f2) {
    i2[n2] = o2[n2] ? function(v2) {
      return (p2 = !p2) ? { value: __await(o2[n2](v2)), done: n2 === "return" } : f2 ? f2(v2) : v2;
    } : f2;
  }
}
function __asyncValues(o2) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m2 = o2[Symbol.asyncIterator], i2;
  return m2 ? m2.call(o2) : (o2 = typeof __values === "function" ? __values(o2) : o2[Symbol.iterator](), i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2);
  function verb(n2) {
    i2[n2] = o2[n2] && function(v2) {
      return new Promise(function(resolve, reject) {
        v2 = o2[n2](v2), settle(resolve, reject, v2.done, v2.value);
      });
    };
  }
  function settle(resolve, reject, d2, v2) {
    Promise.resolve(v2).then(function(v3) {
      resolve({ value: v3, done: d2 });
    }, reject);
  }
}
function __makeTemplateObject(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k2 in mod) if (Object.hasOwnProperty.call(mod, k2)) result[k2] = mod[k2];
  }
  result.default = mod;
  return result;
}
function __importDefault(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet(receiver, privateMap) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to get private field on non-instance");
  }
  return privateMap.get(receiver);
}
function __classPrivateFieldSet(receiver, privateMap, value) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to set private field on non-instance");
  }
  privateMap.set(receiver, value);
  return value;
}
var extendStatics, __assign;
var init_tslib_es6 = __esm({
  "node_modules/@aws-crypto/sha1-browser/node_modules/tslib/tslib.es6.js"() {
    extendStatics = function(d2, b2) {
      extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d3, b3) {
        d3.__proto__ = b3;
      } || function(d3, b3) {
        for (var p2 in b3) if (b3.hasOwnProperty(p2)) d3[p2] = b3[p2];
      };
      return extendStatics(d2, b2);
    };
    __assign = function() {
      __assign = Object.assign || function __assign8(t2) {
        for (var s2, i2 = 1, n2 = arguments.length; i2 < n2; i2++) {
          s2 = arguments[i2];
          for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2)) t2[p2] = s2[p2];
        }
        return t2;
      };
      return __assign.apply(this, arguments);
    };
  }
});

// node_modules/@aws-crypto/sha1-browser/build/isEmptyData.js
var require_isEmptyData = __commonJS({
  "node_modules/@aws-crypto/sha1-browser/build/isEmptyData.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isEmptyData = void 0;
    function isEmptyData2(data) {
      if (typeof data === "string") {
        return data.length === 0;
      }
      return data.byteLength === 0;
    }
    exports.isEmptyData = isEmptyData2;
  }
});

// node_modules/@aws-crypto/sha1-browser/build/constants.js
var require_constants = __commonJS({
  "node_modules/@aws-crypto/sha1-browser/build/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EMPTY_DATA_SHA_1 = exports.SHA_1_HMAC_ALGO = exports.SHA_1_HASH = void 0;
    exports.SHA_1_HASH = { name: "SHA-1" };
    exports.SHA_1_HMAC_ALGO = {
      name: "HMAC",
      hash: exports.SHA_1_HASH
    };
    exports.EMPTY_DATA_SHA_1 = new Uint8Array([
      218,
      57,
      163,
      238,
      94,
      107,
      75,
      13,
      50,
      85,
      191,
      239,
      149,
      96,
      24,
      144,
      175,
      216,
      7,
      9
    ]);
  }
});

// node_modules/@aws-sdk/util-utf8-browser/dist-cjs/pureJs.js
var require_pureJs = __commonJS({
  "node_modules/@aws-sdk/util-utf8-browser/dist-cjs/pureJs.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.toUtf8 = exports.fromUtf8 = void 0;
    var fromUtf82 = (input) => {
      const bytes = [];
      for (let i2 = 0, len = input.length; i2 < len; i2++) {
        const value = input.charCodeAt(i2);
        if (value < 128) {
          bytes.push(value);
        } else if (value < 2048) {
          bytes.push(value >> 6 | 192, value & 63 | 128);
        } else if (i2 + 1 < input.length && (value & 64512) === 55296 && (input.charCodeAt(i2 + 1) & 64512) === 56320) {
          const surrogatePair = 65536 + ((value & 1023) << 10) + (input.charCodeAt(++i2) & 1023);
          bytes.push(surrogatePair >> 18 | 240, surrogatePair >> 12 & 63 | 128, surrogatePair >> 6 & 63 | 128, surrogatePair & 63 | 128);
        } else {
          bytes.push(value >> 12 | 224, value >> 6 & 63 | 128, value & 63 | 128);
        }
      }
      return Uint8Array.from(bytes);
    };
    exports.fromUtf8 = fromUtf82;
    var toUtf82 = (input) => {
      let decoded = "";
      for (let i2 = 0, len = input.length; i2 < len; i2++) {
        const byte = input[i2];
        if (byte < 128) {
          decoded += String.fromCharCode(byte);
        } else if (192 <= byte && byte < 224) {
          const nextByte = input[++i2];
          decoded += String.fromCharCode((byte & 31) << 6 | nextByte & 63);
        } else if (240 <= byte && byte < 365) {
          const surrogatePair = [byte, input[++i2], input[++i2], input[++i2]];
          const encoded = "%" + surrogatePair.map((byteValue) => byteValue.toString(16)).join("%");
          decoded += decodeURIComponent(encoded);
        } else {
          decoded += String.fromCharCode((byte & 15) << 12 | (input[++i2] & 63) << 6 | input[++i2] & 63);
        }
      }
      return decoded;
    };
    exports.toUtf8 = toUtf82;
  }
});

// node_modules/@aws-sdk/util-utf8-browser/dist-cjs/whatwgEncodingApi.js
var require_whatwgEncodingApi = __commonJS({
  "node_modules/@aws-sdk/util-utf8-browser/dist-cjs/whatwgEncodingApi.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.toUtf8 = exports.fromUtf8 = void 0;
    function fromUtf82(input) {
      return new TextEncoder().encode(input);
    }
    exports.fromUtf8 = fromUtf82;
    function toUtf82(input) {
      return new TextDecoder("utf-8").decode(input);
    }
    exports.toUtf8 = toUtf82;
  }
});

// node_modules/@aws-sdk/util-utf8-browser/dist-cjs/index.js
var require_dist_cjs = __commonJS({
  "node_modules/@aws-sdk/util-utf8-browser/dist-cjs/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.toUtf8 = exports.fromUtf8 = void 0;
    var pureJs_1 = require_pureJs();
    var whatwgEncodingApi_1 = require_whatwgEncodingApi();
    var fromUtf82 = (input) => typeof TextEncoder === "function" ? (0, whatwgEncodingApi_1.fromUtf8)(input) : (0, pureJs_1.fromUtf8)(input);
    exports.fromUtf8 = fromUtf82;
    var toUtf82 = (input) => typeof TextDecoder === "function" ? (0, whatwgEncodingApi_1.toUtf8)(input) : (0, pureJs_1.toUtf8)(input);
    exports.toUtf8 = toUtf82;
  }
});

// node_modules/@aws-sdk/util-locate-window/dist-cjs/index.js
var require_dist_cjs2 = __commonJS({
  "node_modules/@aws-sdk/util-locate-window/dist-cjs/index.js"(exports) {
    var fallbackWindow = {};
    function locateWindow() {
      if (typeof window !== "undefined") {
        return window;
      } else if (typeof self !== "undefined") {
        return self;
      }
      return fallbackWindow;
    }
    exports.locateWindow = locateWindow;
  }
});

// node_modules/@aws-crypto/sha1-browser/build/ie11Sha1.js
var require_ie11Sha1 = __commonJS({
  "node_modules/@aws-crypto/sha1-browser/build/ie11Sha1.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Sha1 = void 0;
    var isEmptyData_1 = require_isEmptyData();
    var constants_1 = require_constants();
    var util_utf8_browser_1 = require_dist_cjs();
    var util_locate_window_1 = require_dist_cjs2();
    var Sha12 = (
      /** @class */
      (function() {
        function Sha13(secret) {
          this.secret = secret;
          this.reset();
        }
        Sha13.prototype.update = function(toHash) {
          var _this = this;
          if ((0, isEmptyData_1.isEmptyData)(toHash)) {
            return;
          }
          this.operation = this.operation.then(function(operation) {
            operation.onerror = function() {
              _this.operation = Promise.reject(new Error("Error encountered updating hash"));
            };
            operation.process(toArrayBufferView(toHash));
            return operation;
          });
          this.operation.catch(function() {
          });
        };
        Sha13.prototype.digest = function() {
          return this.operation.then(function(operation) {
            return new Promise(function(resolve, reject) {
              operation.onerror = function() {
                reject(new Error("Error encountered finalizing hash"));
              };
              operation.oncomplete = function() {
                if (operation.result) {
                  resolve(new Uint8Array(operation.result));
                }
                reject(new Error("Error encountered finalizing hash"));
              };
              operation.finish();
            });
          });
        };
        Sha13.prototype.reset = function() {
          if (this.secret) {
            this.operation = getKeyPromise(this.secret).then(function(keyData) {
              return (0, util_locate_window_1.locateWindow)().msCrypto.subtle.sign(constants_1.SHA_1_HMAC_ALGO, keyData);
            });
            this.operation.catch(function() {
            });
          } else {
            this.operation = Promise.resolve((0, util_locate_window_1.locateWindow)().msCrypto.subtle.digest("SHA-1"));
          }
        };
        return Sha13;
      })()
    );
    exports.Sha1 = Sha12;
    function getKeyPromise(secret) {
      return new Promise(function(resolve, reject) {
        var keyOperation = (0, util_locate_window_1.locateWindow)().msCrypto.subtle.importKey("raw", toArrayBufferView(secret), constants_1.SHA_1_HMAC_ALGO, false, ["sign"]);
        keyOperation.oncomplete = function() {
          if (keyOperation.result) {
            resolve(keyOperation.result);
          }
          reject(new Error("ImportKey completed without importing key."));
        };
        keyOperation.onerror = function() {
          reject(new Error("ImportKey failed to import key."));
        };
      });
    }
    function toArrayBufferView(data) {
      if (typeof data === "string") {
        return (0, util_utf8_browser_1.fromUtf8)(data);
      }
      if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
      }
      return new Uint8Array(data);
    }
  }
});

// node_modules/@aws-crypto/sha1-browser/build/webCryptoSha1.js
var require_webCryptoSha1 = __commonJS({
  "node_modules/@aws-crypto/sha1-browser/build/webCryptoSha1.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Sha1 = void 0;
    var util_utf8_browser_1 = require_dist_cjs();
    var isEmptyData_1 = require_isEmptyData();
    var constants_1 = require_constants();
    var util_locate_window_1 = require_dist_cjs2();
    var Sha12 = (
      /** @class */
      (function() {
        function Sha13(secret) {
          this.toHash = new Uint8Array(0);
          if (secret !== void 0) {
            this.key = new Promise(function(resolve, reject) {
              (0, util_locate_window_1.locateWindow)().crypto.subtle.importKey("raw", convertToBuffer2(secret), constants_1.SHA_1_HMAC_ALGO, false, ["sign"]).then(resolve, reject);
            });
            this.key.catch(function() {
            });
          }
        }
        Sha13.prototype.update = function(data) {
          if ((0, isEmptyData_1.isEmptyData)(data)) {
            return;
          }
          var update = convertToBuffer2(data);
          var typedArray = new Uint8Array(this.toHash.byteLength + update.byteLength);
          typedArray.set(this.toHash, 0);
          typedArray.set(update, this.toHash.byteLength);
          this.toHash = typedArray;
        };
        Sha13.prototype.digest = function() {
          var _this = this;
          if (this.key) {
            return this.key.then(function(key) {
              return (0, util_locate_window_1.locateWindow)().crypto.subtle.sign(constants_1.SHA_1_HMAC_ALGO, key, _this.toHash).then(function(data) {
                return new Uint8Array(data);
              });
            });
          }
          if ((0, isEmptyData_1.isEmptyData)(this.toHash)) {
            return Promise.resolve(constants_1.EMPTY_DATA_SHA_1);
          }
          return Promise.resolve().then(function() {
            return (0, util_locate_window_1.locateWindow)().crypto.subtle.digest(constants_1.SHA_1_HASH, _this.toHash);
          }).then(function(data) {
            return Promise.resolve(new Uint8Array(data));
          });
        };
        Sha13.prototype.reset = function() {
          this.toHash = new Uint8Array(0);
        };
        return Sha13;
      })()
    );
    exports.Sha1 = Sha12;
    function convertToBuffer2(data) {
      if (typeof data === "string") {
        return (0, util_utf8_browser_1.fromUtf8)(data);
      }
      if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
      }
      return new Uint8Array(data);
    }
  }
});

// node_modules/@aws-crypto/supports-web-crypto/node_modules/tslib/tslib.es6.js
var tslib_es6_exports2 = {};
__export(tslib_es6_exports2, {
  __assign: () => __assign2,
  __asyncDelegator: () => __asyncDelegator2,
  __asyncGenerator: () => __asyncGenerator2,
  __asyncValues: () => __asyncValues2,
  __await: () => __await2,
  __awaiter: () => __awaiter2,
  __classPrivateFieldGet: () => __classPrivateFieldGet2,
  __classPrivateFieldSet: () => __classPrivateFieldSet2,
  __createBinding: () => __createBinding2,
  __decorate: () => __decorate2,
  __exportStar: () => __exportStar2,
  __extends: () => __extends2,
  __generator: () => __generator2,
  __importDefault: () => __importDefault2,
  __importStar: () => __importStar2,
  __makeTemplateObject: () => __makeTemplateObject2,
  __metadata: () => __metadata2,
  __param: () => __param2,
  __read: () => __read2,
  __rest: () => __rest2,
  __spread: () => __spread2,
  __spreadArrays: () => __spreadArrays2,
  __values: () => __values2
});
function __extends2(d2, b2) {
  extendStatics2(d2, b2);
  function __() {
    this.constructor = d2;
  }
  d2.prototype = b2 === null ? Object.create(b2) : (__.prototype = b2.prototype, new __());
}
function __rest2(s2, e2) {
  var t2 = {};
  for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2) && e2.indexOf(p2) < 0)
    t2[p2] = s2[p2];
  if (s2 != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i2 = 0, p2 = Object.getOwnPropertySymbols(s2); i2 < p2.length; i2++) {
      if (e2.indexOf(p2[i2]) < 0 && Object.prototype.propertyIsEnumerable.call(s2, p2[i2]))
        t2[p2[i2]] = s2[p2[i2]];
    }
  return t2;
}
function __decorate2(decorators, target, key, desc) {
  var c2 = arguments.length, r2 = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d2;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r2 = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d2 = decorators[i2]) r2 = (c2 < 3 ? d2(r2) : c2 > 3 ? d2(target, key, r2) : d2(target, key)) || r2;
  return c2 > 3 && r2 && Object.defineProperty(target, key, r2), r2;
}
function __param2(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __metadata2(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter2(thisArg, _arguments, P2, generator) {
  function adopt(value) {
    return value instanceof P2 ? value : new P2(function(resolve) {
      resolve(value);
    });
  }
  return new (P2 || (P2 = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e2) {
        reject(e2);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e2) {
        reject(e2);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator2(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t2[0] & 1) throw t2[1];
    return t2[1];
  }, trys: [], ops: [] }, f2, y2, t2, g2;
  return g2 = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g2[Symbol.iterator] = function() {
    return this;
  }), g2;
  function verb(n2) {
    return function(v2) {
      return step([n2, v2]);
    };
  }
  function step(op) {
    if (f2) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f2 = 1, y2 && (t2 = op[0] & 2 ? y2["return"] : op[0] ? y2["throw"] || ((t2 = y2["return"]) && t2.call(y2), 0) : y2.next) && !(t2 = t2.call(y2, op[1])).done) return t2;
      if (y2 = 0, t2) op = [op[0] & 2, t2.value];
      switch (op[0]) {
        case 0:
        case 1:
          t2 = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y2 = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t2 = _.trys, t2 = t2.length > 0 && t2[t2.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t2 || op[1] > t2[0] && op[1] < t2[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t2[1]) {
            _.label = t2[1];
            t2 = op;
            break;
          }
          if (t2 && _.label < t2[2]) {
            _.label = t2[2];
            _.ops.push(op);
            break;
          }
          if (t2[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e2) {
      op = [6, e2];
      y2 = 0;
    } finally {
      f2 = t2 = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __createBinding2(o2, m2, k2, k22) {
  if (k22 === void 0) k22 = k2;
  o2[k22] = m2[k2];
}
function __exportStar2(m2, exports) {
  for (var p2 in m2) if (p2 !== "default" && !exports.hasOwnProperty(p2)) exports[p2] = m2[p2];
}
function __values2(o2) {
  var s2 = typeof Symbol === "function" && Symbol.iterator, m2 = s2 && o2[s2], i2 = 0;
  if (m2) return m2.call(o2);
  if (o2 && typeof o2.length === "number") return {
    next: function() {
      if (o2 && i2 >= o2.length) o2 = void 0;
      return { value: o2 && o2[i2++], done: !o2 };
    }
  };
  throw new TypeError(s2 ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read2(o2, n2) {
  var m2 = typeof Symbol === "function" && o2[Symbol.iterator];
  if (!m2) return o2;
  var i2 = m2.call(o2), r2, ar2 = [], e2;
  try {
    while ((n2 === void 0 || n2-- > 0) && !(r2 = i2.next()).done) ar2.push(r2.value);
  } catch (error) {
    e2 = { error };
  } finally {
    try {
      if (r2 && !r2.done && (m2 = i2["return"])) m2.call(i2);
    } finally {
      if (e2) throw e2.error;
    }
  }
  return ar2;
}
function __spread2() {
  for (var ar2 = [], i2 = 0; i2 < arguments.length; i2++)
    ar2 = ar2.concat(__read2(arguments[i2]));
  return ar2;
}
function __spreadArrays2() {
  for (var s2 = 0, i2 = 0, il = arguments.length; i2 < il; i2++) s2 += arguments[i2].length;
  for (var r2 = Array(s2), k2 = 0, i2 = 0; i2 < il; i2++)
    for (var a2 = arguments[i2], j2 = 0, jl = a2.length; j2 < jl; j2++, k2++)
      r2[k2] = a2[j2];
  return r2;
}
function __await2(v2) {
  return this instanceof __await2 ? (this.v = v2, this) : new __await2(v2);
}
function __asyncGenerator2(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g2 = generator.apply(thisArg, _arguments || []), i2, q2 = [];
  return i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2;
  function verb(n2) {
    if (g2[n2]) i2[n2] = function(v2) {
      return new Promise(function(a2, b2) {
        q2.push([n2, v2, a2, b2]) > 1 || resume(n2, v2);
      });
    };
  }
  function resume(n2, v2) {
    try {
      step(g2[n2](v2));
    } catch (e2) {
      settle(q2[0][3], e2);
    }
  }
  function step(r2) {
    r2.value instanceof __await2 ? Promise.resolve(r2.value.v).then(fulfill, reject) : settle(q2[0][2], r2);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f2, v2) {
    if (f2(v2), q2.shift(), q2.length) resume(q2[0][0], q2[0][1]);
  }
}
function __asyncDelegator2(o2) {
  var i2, p2;
  return i2 = {}, verb("next"), verb("throw", function(e2) {
    throw e2;
  }), verb("return"), i2[Symbol.iterator] = function() {
    return this;
  }, i2;
  function verb(n2, f2) {
    i2[n2] = o2[n2] ? function(v2) {
      return (p2 = !p2) ? { value: __await2(o2[n2](v2)), done: n2 === "return" } : f2 ? f2(v2) : v2;
    } : f2;
  }
}
function __asyncValues2(o2) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m2 = o2[Symbol.asyncIterator], i2;
  return m2 ? m2.call(o2) : (o2 = typeof __values2 === "function" ? __values2(o2) : o2[Symbol.iterator](), i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2);
  function verb(n2) {
    i2[n2] = o2[n2] && function(v2) {
      return new Promise(function(resolve, reject) {
        v2 = o2[n2](v2), settle(resolve, reject, v2.done, v2.value);
      });
    };
  }
  function settle(resolve, reject, d2, v2) {
    Promise.resolve(v2).then(function(v3) {
      resolve({ value: v3, done: d2 });
    }, reject);
  }
}
function __makeTemplateObject2(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar2(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k2 in mod) if (Object.hasOwnProperty.call(mod, k2)) result[k2] = mod[k2];
  }
  result.default = mod;
  return result;
}
function __importDefault2(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet2(receiver, privateMap) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to get private field on non-instance");
  }
  return privateMap.get(receiver);
}
function __classPrivateFieldSet2(receiver, privateMap, value) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to set private field on non-instance");
  }
  privateMap.set(receiver, value);
  return value;
}
var extendStatics2, __assign2;
var init_tslib_es62 = __esm({
  "node_modules/@aws-crypto/supports-web-crypto/node_modules/tslib/tslib.es6.js"() {
    extendStatics2 = function(d2, b2) {
      extendStatics2 = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d3, b3) {
        d3.__proto__ = b3;
      } || function(d3, b3) {
        for (var p2 in b3) if (b3.hasOwnProperty(p2)) d3[p2] = b3[p2];
      };
      return extendStatics2(d2, b2);
    };
    __assign2 = function() {
      __assign2 = Object.assign || function __assign8(t2) {
        for (var s2, i2 = 1, n2 = arguments.length; i2 < n2; i2++) {
          s2 = arguments[i2];
          for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2)) t2[p2] = s2[p2];
        }
        return t2;
      };
      return __assign2.apply(this, arguments);
    };
  }
});

// node_modules/@aws-crypto/supports-web-crypto/build/supportsWebCrypto.js
var require_supportsWebCrypto = __commonJS({
  "node_modules/@aws-crypto/supports-web-crypto/build/supportsWebCrypto.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.supportsZeroByteGCM = exports.supportsSubtleCrypto = exports.supportsSecureRandom = exports.supportsWebCrypto = void 0;
    var tslib_1 = (init_tslib_es62(), __toCommonJS(tslib_es6_exports2));
    var subtleCryptoMethods = [
      "decrypt",
      "digest",
      "encrypt",
      "exportKey",
      "generateKey",
      "importKey",
      "sign",
      "verify"
    ];
    function supportsWebCrypto(window2) {
      if (supportsSecureRandom(window2) && typeof window2.crypto.subtle === "object") {
        var subtle = window2.crypto.subtle;
        return supportsSubtleCrypto(subtle);
      }
      return false;
    }
    exports.supportsWebCrypto = supportsWebCrypto;
    function supportsSecureRandom(window2) {
      if (typeof window2 === "object" && typeof window2.crypto === "object") {
        var getRandomValues2 = window2.crypto.getRandomValues;
        return typeof getRandomValues2 === "function";
      }
      return false;
    }
    exports.supportsSecureRandom = supportsSecureRandom;
    function supportsSubtleCrypto(subtle) {
      return subtle && subtleCryptoMethods.every(function(methodName) {
        return typeof subtle[methodName] === "function";
      });
    }
    exports.supportsSubtleCrypto = supportsSubtleCrypto;
    function supportsZeroByteGCM(subtle) {
      return tslib_1.__awaiter(this, void 0, void 0, function() {
        var key, zeroByteAuthTag, _a;
        return tslib_1.__generator(this, function(_b) {
          switch (_b.label) {
            case 0:
              if (!supportsSubtleCrypto(subtle))
                return [2, false];
              _b.label = 1;
            case 1:
              _b.trys.push([1, 4, , 5]);
              return [4, subtle.generateKey({ name: "AES-GCM", length: 128 }, false, ["encrypt"])];
            case 2:
              key = _b.sent();
              return [4, subtle.encrypt({
                name: "AES-GCM",
                iv: new Uint8Array(Array(12)),
                additionalData: new Uint8Array(Array(16)),
                tagLength: 128
              }, key, new Uint8Array(0))];
            case 3:
              zeroByteAuthTag = _b.sent();
              return [2, zeroByteAuthTag.byteLength === 16];
            case 4:
              _a = _b.sent();
              return [2, false];
            case 5:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    }
    exports.supportsZeroByteGCM = supportsZeroByteGCM;
  }
});

// node_modules/@aws-crypto/supports-web-crypto/build/index.js
var require_build = __commonJS({
  "node_modules/@aws-crypto/supports-web-crypto/build/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es62(), __toCommonJS(tslib_es6_exports2));
    tslib_1.__exportStar(require_supportsWebCrypto(), exports);
  }
});

// node_modules/@aws-crypto/ie11-detection/node_modules/tslib/tslib.es6.js
var tslib_es6_exports3 = {};
__export(tslib_es6_exports3, {
  __assign: () => __assign3,
  __asyncDelegator: () => __asyncDelegator3,
  __asyncGenerator: () => __asyncGenerator3,
  __asyncValues: () => __asyncValues3,
  __await: () => __await3,
  __awaiter: () => __awaiter3,
  __classPrivateFieldGet: () => __classPrivateFieldGet3,
  __classPrivateFieldSet: () => __classPrivateFieldSet3,
  __createBinding: () => __createBinding3,
  __decorate: () => __decorate3,
  __exportStar: () => __exportStar3,
  __extends: () => __extends3,
  __generator: () => __generator3,
  __importDefault: () => __importDefault3,
  __importStar: () => __importStar3,
  __makeTemplateObject: () => __makeTemplateObject3,
  __metadata: () => __metadata3,
  __param: () => __param3,
  __read: () => __read3,
  __rest: () => __rest3,
  __spread: () => __spread3,
  __spreadArrays: () => __spreadArrays3,
  __values: () => __values3
});
function __extends3(d2, b2) {
  extendStatics3(d2, b2);
  function __() {
    this.constructor = d2;
  }
  d2.prototype = b2 === null ? Object.create(b2) : (__.prototype = b2.prototype, new __());
}
function __rest3(s2, e2) {
  var t2 = {};
  for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2) && e2.indexOf(p2) < 0)
    t2[p2] = s2[p2];
  if (s2 != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i2 = 0, p2 = Object.getOwnPropertySymbols(s2); i2 < p2.length; i2++) {
      if (e2.indexOf(p2[i2]) < 0 && Object.prototype.propertyIsEnumerable.call(s2, p2[i2]))
        t2[p2[i2]] = s2[p2[i2]];
    }
  return t2;
}
function __decorate3(decorators, target, key, desc) {
  var c2 = arguments.length, r2 = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d2;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r2 = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d2 = decorators[i2]) r2 = (c2 < 3 ? d2(r2) : c2 > 3 ? d2(target, key, r2) : d2(target, key)) || r2;
  return c2 > 3 && r2 && Object.defineProperty(target, key, r2), r2;
}
function __param3(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __metadata3(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter3(thisArg, _arguments, P2, generator) {
  function adopt(value) {
    return value instanceof P2 ? value : new P2(function(resolve) {
      resolve(value);
    });
  }
  return new (P2 || (P2 = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e2) {
        reject(e2);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e2) {
        reject(e2);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator3(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t2[0] & 1) throw t2[1];
    return t2[1];
  }, trys: [], ops: [] }, f2, y2, t2, g2;
  return g2 = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g2[Symbol.iterator] = function() {
    return this;
  }), g2;
  function verb(n2) {
    return function(v2) {
      return step([n2, v2]);
    };
  }
  function step(op) {
    if (f2) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f2 = 1, y2 && (t2 = op[0] & 2 ? y2["return"] : op[0] ? y2["throw"] || ((t2 = y2["return"]) && t2.call(y2), 0) : y2.next) && !(t2 = t2.call(y2, op[1])).done) return t2;
      if (y2 = 0, t2) op = [op[0] & 2, t2.value];
      switch (op[0]) {
        case 0:
        case 1:
          t2 = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y2 = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t2 = _.trys, t2 = t2.length > 0 && t2[t2.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t2 || op[1] > t2[0] && op[1] < t2[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t2[1]) {
            _.label = t2[1];
            t2 = op;
            break;
          }
          if (t2 && _.label < t2[2]) {
            _.label = t2[2];
            _.ops.push(op);
            break;
          }
          if (t2[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e2) {
      op = [6, e2];
      y2 = 0;
    } finally {
      f2 = t2 = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __createBinding3(o2, m2, k2, k22) {
  if (k22 === void 0) k22 = k2;
  o2[k22] = m2[k2];
}
function __exportStar3(m2, exports) {
  for (var p2 in m2) if (p2 !== "default" && !exports.hasOwnProperty(p2)) exports[p2] = m2[p2];
}
function __values3(o2) {
  var s2 = typeof Symbol === "function" && Symbol.iterator, m2 = s2 && o2[s2], i2 = 0;
  if (m2) return m2.call(o2);
  if (o2 && typeof o2.length === "number") return {
    next: function() {
      if (o2 && i2 >= o2.length) o2 = void 0;
      return { value: o2 && o2[i2++], done: !o2 };
    }
  };
  throw new TypeError(s2 ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read3(o2, n2) {
  var m2 = typeof Symbol === "function" && o2[Symbol.iterator];
  if (!m2) return o2;
  var i2 = m2.call(o2), r2, ar2 = [], e2;
  try {
    while ((n2 === void 0 || n2-- > 0) && !(r2 = i2.next()).done) ar2.push(r2.value);
  } catch (error) {
    e2 = { error };
  } finally {
    try {
      if (r2 && !r2.done && (m2 = i2["return"])) m2.call(i2);
    } finally {
      if (e2) throw e2.error;
    }
  }
  return ar2;
}
function __spread3() {
  for (var ar2 = [], i2 = 0; i2 < arguments.length; i2++)
    ar2 = ar2.concat(__read3(arguments[i2]));
  return ar2;
}
function __spreadArrays3() {
  for (var s2 = 0, i2 = 0, il = arguments.length; i2 < il; i2++) s2 += arguments[i2].length;
  for (var r2 = Array(s2), k2 = 0, i2 = 0; i2 < il; i2++)
    for (var a2 = arguments[i2], j2 = 0, jl = a2.length; j2 < jl; j2++, k2++)
      r2[k2] = a2[j2];
  return r2;
}
function __await3(v2) {
  return this instanceof __await3 ? (this.v = v2, this) : new __await3(v2);
}
function __asyncGenerator3(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g2 = generator.apply(thisArg, _arguments || []), i2, q2 = [];
  return i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2;
  function verb(n2) {
    if (g2[n2]) i2[n2] = function(v2) {
      return new Promise(function(a2, b2) {
        q2.push([n2, v2, a2, b2]) > 1 || resume(n2, v2);
      });
    };
  }
  function resume(n2, v2) {
    try {
      step(g2[n2](v2));
    } catch (e2) {
      settle(q2[0][3], e2);
    }
  }
  function step(r2) {
    r2.value instanceof __await3 ? Promise.resolve(r2.value.v).then(fulfill, reject) : settle(q2[0][2], r2);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f2, v2) {
    if (f2(v2), q2.shift(), q2.length) resume(q2[0][0], q2[0][1]);
  }
}
function __asyncDelegator3(o2) {
  var i2, p2;
  return i2 = {}, verb("next"), verb("throw", function(e2) {
    throw e2;
  }), verb("return"), i2[Symbol.iterator] = function() {
    return this;
  }, i2;
  function verb(n2, f2) {
    i2[n2] = o2[n2] ? function(v2) {
      return (p2 = !p2) ? { value: __await3(o2[n2](v2)), done: n2 === "return" } : f2 ? f2(v2) : v2;
    } : f2;
  }
}
function __asyncValues3(o2) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m2 = o2[Symbol.asyncIterator], i2;
  return m2 ? m2.call(o2) : (o2 = typeof __values3 === "function" ? __values3(o2) : o2[Symbol.iterator](), i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2);
  function verb(n2) {
    i2[n2] = o2[n2] && function(v2) {
      return new Promise(function(resolve, reject) {
        v2 = o2[n2](v2), settle(resolve, reject, v2.done, v2.value);
      });
    };
  }
  function settle(resolve, reject, d2, v2) {
    Promise.resolve(v2).then(function(v3) {
      resolve({ value: v3, done: d2 });
    }, reject);
  }
}
function __makeTemplateObject3(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar3(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k2 in mod) if (Object.hasOwnProperty.call(mod, k2)) result[k2] = mod[k2];
  }
  result.default = mod;
  return result;
}
function __importDefault3(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet3(receiver, privateMap) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to get private field on non-instance");
  }
  return privateMap.get(receiver);
}
function __classPrivateFieldSet3(receiver, privateMap, value) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to set private field on non-instance");
  }
  privateMap.set(receiver, value);
  return value;
}
var extendStatics3, __assign3;
var init_tslib_es63 = __esm({
  "node_modules/@aws-crypto/ie11-detection/node_modules/tslib/tslib.es6.js"() {
    extendStatics3 = function(d2, b2) {
      extendStatics3 = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d3, b3) {
        d3.__proto__ = b3;
      } || function(d3, b3) {
        for (var p2 in b3) if (b3.hasOwnProperty(p2)) d3[p2] = b3[p2];
      };
      return extendStatics3(d2, b2);
    };
    __assign3 = function() {
      __assign3 = Object.assign || function __assign8(t2) {
        for (var s2, i2 = 1, n2 = arguments.length; i2 < n2; i2++) {
          s2 = arguments[i2];
          for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2)) t2[p2] = s2[p2];
        }
        return t2;
      };
      return __assign3.apply(this, arguments);
    };
  }
});

// node_modules/@aws-crypto/ie11-detection/build/CryptoOperation.js
var require_CryptoOperation = __commonJS({
  "node_modules/@aws-crypto/ie11-detection/build/CryptoOperation.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/@aws-crypto/ie11-detection/build/Key.js
var require_Key = __commonJS({
  "node_modules/@aws-crypto/ie11-detection/build/Key.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/@aws-crypto/ie11-detection/build/KeyOperation.js
var require_KeyOperation = __commonJS({
  "node_modules/@aws-crypto/ie11-detection/build/KeyOperation.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/@aws-crypto/ie11-detection/build/MsSubtleCrypto.js
var require_MsSubtleCrypto = __commonJS({
  "node_modules/@aws-crypto/ie11-detection/build/MsSubtleCrypto.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/@aws-crypto/ie11-detection/build/MsWindow.js
var require_MsWindow = __commonJS({
  "node_modules/@aws-crypto/ie11-detection/build/MsWindow.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isMsWindow = void 0;
    var msSubtleCryptoMethods = [
      "decrypt",
      "digest",
      "encrypt",
      "exportKey",
      "generateKey",
      "importKey",
      "sign",
      "verify"
    ];
    function quacksLikeAnMsWindow(window2) {
      return "MSInputMethodContext" in window2 && "msCrypto" in window2;
    }
    function isMsWindow(window2) {
      if (quacksLikeAnMsWindow(window2) && window2.msCrypto.subtle !== void 0) {
        var _a = window2.msCrypto, getRandomValues2 = _a.getRandomValues, subtle_1 = _a.subtle;
        return msSubtleCryptoMethods.map(function(methodName) {
          return subtle_1[methodName];
        }).concat(getRandomValues2).every(function(method) {
          return typeof method === "function";
        });
      }
      return false;
    }
    exports.isMsWindow = isMsWindow;
  }
});

// node_modules/@aws-crypto/ie11-detection/build/index.js
var require_build2 = __commonJS({
  "node_modules/@aws-crypto/ie11-detection/build/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es63(), __toCommonJS(tslib_es6_exports3));
    tslib_1.__exportStar(require_CryptoOperation(), exports);
    tslib_1.__exportStar(require_Key(), exports);
    tslib_1.__exportStar(require_KeyOperation(), exports);
    tslib_1.__exportStar(require_MsSubtleCrypto(), exports);
    tslib_1.__exportStar(require_MsWindow(), exports);
  }
});

// node_modules/@aws-crypto/util/build/convertToBuffer.js
var require_convertToBuffer = __commonJS({
  "node_modules/@aws-crypto/util/build/convertToBuffer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.convertToBuffer = void 0;
    var util_utf8_browser_1 = require_dist_cjs();
    var fromUtf82 = typeof Buffer !== "undefined" && Buffer.from ? function(input) {
      return Buffer.from(input, "utf8");
    } : util_utf8_browser_1.fromUtf8;
    function convertToBuffer2(data) {
      if (data instanceof Uint8Array)
        return data;
      if (typeof data === "string") {
        return fromUtf82(data);
      }
      if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
      }
      return new Uint8Array(data);
    }
    exports.convertToBuffer = convertToBuffer2;
  }
});

// node_modules/@aws-crypto/util/build/isEmptyData.js
var require_isEmptyData2 = __commonJS({
  "node_modules/@aws-crypto/util/build/isEmptyData.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isEmptyData = void 0;
    function isEmptyData2(data) {
      if (typeof data === "string") {
        return data.length === 0;
      }
      return data.byteLength === 0;
    }
    exports.isEmptyData = isEmptyData2;
  }
});

// node_modules/@aws-crypto/util/build/numToUint8.js
var require_numToUint8 = __commonJS({
  "node_modules/@aws-crypto/util/build/numToUint8.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.numToUint8 = void 0;
    function numToUint8(num) {
      return new Uint8Array([
        (num & 4278190080) >> 24,
        (num & 16711680) >> 16,
        (num & 65280) >> 8,
        num & 255
      ]);
    }
    exports.numToUint8 = numToUint8;
  }
});

// node_modules/@aws-crypto/util/build/uint32ArrayFrom.js
var require_uint32ArrayFrom = __commonJS({
  "node_modules/@aws-crypto/util/build/uint32ArrayFrom.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.uint32ArrayFrom = void 0;
    function uint32ArrayFrom(a_lookUpTable) {
      if (!Uint32Array.from) {
        var return_array = new Uint32Array(a_lookUpTable.length);
        var a_index = 0;
        while (a_index < a_lookUpTable.length) {
          return_array[a_index] = a_lookUpTable[a_index];
          a_index += 1;
        }
        return return_array;
      }
      return Uint32Array.from(a_lookUpTable);
    }
    exports.uint32ArrayFrom = uint32ArrayFrom;
  }
});

// node_modules/@aws-crypto/util/build/index.js
var require_build3 = __commonJS({
  "node_modules/@aws-crypto/util/build/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.uint32ArrayFrom = exports.numToUint8 = exports.isEmptyData = exports.convertToBuffer = void 0;
    var convertToBuffer_1 = require_convertToBuffer();
    Object.defineProperty(exports, "convertToBuffer", { enumerable: true, get: function() {
      return convertToBuffer_1.convertToBuffer;
    } });
    var isEmptyData_1 = require_isEmptyData2();
    Object.defineProperty(exports, "isEmptyData", { enumerable: true, get: function() {
      return isEmptyData_1.isEmptyData;
    } });
    var numToUint8_1 = require_numToUint8();
    Object.defineProperty(exports, "numToUint8", { enumerable: true, get: function() {
      return numToUint8_1.numToUint8;
    } });
    var uint32ArrayFrom_1 = require_uint32ArrayFrom();
    Object.defineProperty(exports, "uint32ArrayFrom", { enumerable: true, get: function() {
      return uint32ArrayFrom_1.uint32ArrayFrom;
    } });
  }
});

// node_modules/@aws-crypto/sha1-browser/build/crossPlatformSha1.js
var require_crossPlatformSha1 = __commonJS({
  "node_modules/@aws-crypto/sha1-browser/build/crossPlatformSha1.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Sha1 = void 0;
    var ie11Sha1_1 = require_ie11Sha1();
    var webCryptoSha1_1 = require_webCryptoSha1();
    var supports_web_crypto_1 = require_build();
    var ie11_detection_1 = require_build2();
    var util_locate_window_1 = require_dist_cjs2();
    var util_1 = require_build3();
    var Sha12 = (
      /** @class */
      (function() {
        function Sha13(secret) {
          if ((0, supports_web_crypto_1.supportsWebCrypto)((0, util_locate_window_1.locateWindow)())) {
            this.hash = new webCryptoSha1_1.Sha1(secret);
          } else if ((0, ie11_detection_1.isMsWindow)((0, util_locate_window_1.locateWindow)())) {
            this.hash = new ie11Sha1_1.Sha1(secret);
          } else {
            throw new Error("SHA1 not supported");
          }
        }
        Sha13.prototype.update = function(data, encoding) {
          this.hash.update((0, util_1.convertToBuffer)(data));
        };
        Sha13.prototype.digest = function() {
          return this.hash.digest();
        };
        Sha13.prototype.reset = function() {
          this.hash.reset();
        };
        return Sha13;
      })()
    );
    exports.Sha1 = Sha12;
  }
});

// node_modules/@aws-crypto/sha1-browser/build/index.js
var require_build4 = __commonJS({
  "node_modules/@aws-crypto/sha1-browser/build/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WebCryptoSha1 = exports.Ie11Sha1 = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    tslib_1.__exportStar(require_crossPlatformSha1(), exports);
    var ie11Sha1_1 = require_ie11Sha1();
    Object.defineProperty(exports, "Ie11Sha1", { enumerable: true, get: function() {
      return ie11Sha1_1.Sha1;
    } });
    var webCryptoSha1_1 = require_webCryptoSha1();
    Object.defineProperty(exports, "WebCryptoSha1", { enumerable: true, get: function() {
      return webCryptoSha1_1.Sha1;
    } });
  }
});

// node_modules/@aws-crypto/sha256-browser/node_modules/tslib/tslib.es6.js
var tslib_es6_exports4 = {};
__export(tslib_es6_exports4, {
  __assign: () => __assign4,
  __asyncDelegator: () => __asyncDelegator4,
  __asyncGenerator: () => __asyncGenerator4,
  __asyncValues: () => __asyncValues4,
  __await: () => __await4,
  __awaiter: () => __awaiter4,
  __classPrivateFieldGet: () => __classPrivateFieldGet4,
  __classPrivateFieldSet: () => __classPrivateFieldSet4,
  __createBinding: () => __createBinding4,
  __decorate: () => __decorate4,
  __exportStar: () => __exportStar4,
  __extends: () => __extends4,
  __generator: () => __generator4,
  __importDefault: () => __importDefault4,
  __importStar: () => __importStar4,
  __makeTemplateObject: () => __makeTemplateObject4,
  __metadata: () => __metadata4,
  __param: () => __param4,
  __read: () => __read4,
  __rest: () => __rest4,
  __spread: () => __spread4,
  __spreadArrays: () => __spreadArrays4,
  __values: () => __values4
});
function __extends4(d2, b2) {
  extendStatics4(d2, b2);
  function __() {
    this.constructor = d2;
  }
  d2.prototype = b2 === null ? Object.create(b2) : (__.prototype = b2.prototype, new __());
}
function __rest4(s2, e2) {
  var t2 = {};
  for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2) && e2.indexOf(p2) < 0)
    t2[p2] = s2[p2];
  if (s2 != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i2 = 0, p2 = Object.getOwnPropertySymbols(s2); i2 < p2.length; i2++) {
      if (e2.indexOf(p2[i2]) < 0 && Object.prototype.propertyIsEnumerable.call(s2, p2[i2]))
        t2[p2[i2]] = s2[p2[i2]];
    }
  return t2;
}
function __decorate4(decorators, target, key, desc) {
  var c2 = arguments.length, r2 = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d2;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r2 = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d2 = decorators[i2]) r2 = (c2 < 3 ? d2(r2) : c2 > 3 ? d2(target, key, r2) : d2(target, key)) || r2;
  return c2 > 3 && r2 && Object.defineProperty(target, key, r2), r2;
}
function __param4(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __metadata4(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter4(thisArg, _arguments, P2, generator) {
  function adopt(value) {
    return value instanceof P2 ? value : new P2(function(resolve) {
      resolve(value);
    });
  }
  return new (P2 || (P2 = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e2) {
        reject(e2);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e2) {
        reject(e2);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator4(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t2[0] & 1) throw t2[1];
    return t2[1];
  }, trys: [], ops: [] }, f2, y2, t2, g2;
  return g2 = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g2[Symbol.iterator] = function() {
    return this;
  }), g2;
  function verb(n2) {
    return function(v2) {
      return step([n2, v2]);
    };
  }
  function step(op) {
    if (f2) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f2 = 1, y2 && (t2 = op[0] & 2 ? y2["return"] : op[0] ? y2["throw"] || ((t2 = y2["return"]) && t2.call(y2), 0) : y2.next) && !(t2 = t2.call(y2, op[1])).done) return t2;
      if (y2 = 0, t2) op = [op[0] & 2, t2.value];
      switch (op[0]) {
        case 0:
        case 1:
          t2 = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y2 = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t2 = _.trys, t2 = t2.length > 0 && t2[t2.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t2 || op[1] > t2[0] && op[1] < t2[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t2[1]) {
            _.label = t2[1];
            t2 = op;
            break;
          }
          if (t2 && _.label < t2[2]) {
            _.label = t2[2];
            _.ops.push(op);
            break;
          }
          if (t2[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e2) {
      op = [6, e2];
      y2 = 0;
    } finally {
      f2 = t2 = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __createBinding4(o2, m2, k2, k22) {
  if (k22 === void 0) k22 = k2;
  o2[k22] = m2[k2];
}
function __exportStar4(m2, exports) {
  for (var p2 in m2) if (p2 !== "default" && !exports.hasOwnProperty(p2)) exports[p2] = m2[p2];
}
function __values4(o2) {
  var s2 = typeof Symbol === "function" && Symbol.iterator, m2 = s2 && o2[s2], i2 = 0;
  if (m2) return m2.call(o2);
  if (o2 && typeof o2.length === "number") return {
    next: function() {
      if (o2 && i2 >= o2.length) o2 = void 0;
      return { value: o2 && o2[i2++], done: !o2 };
    }
  };
  throw new TypeError(s2 ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read4(o2, n2) {
  var m2 = typeof Symbol === "function" && o2[Symbol.iterator];
  if (!m2) return o2;
  var i2 = m2.call(o2), r2, ar2 = [], e2;
  try {
    while ((n2 === void 0 || n2-- > 0) && !(r2 = i2.next()).done) ar2.push(r2.value);
  } catch (error) {
    e2 = { error };
  } finally {
    try {
      if (r2 && !r2.done && (m2 = i2["return"])) m2.call(i2);
    } finally {
      if (e2) throw e2.error;
    }
  }
  return ar2;
}
function __spread4() {
  for (var ar2 = [], i2 = 0; i2 < arguments.length; i2++)
    ar2 = ar2.concat(__read4(arguments[i2]));
  return ar2;
}
function __spreadArrays4() {
  for (var s2 = 0, i2 = 0, il = arguments.length; i2 < il; i2++) s2 += arguments[i2].length;
  for (var r2 = Array(s2), k2 = 0, i2 = 0; i2 < il; i2++)
    for (var a2 = arguments[i2], j2 = 0, jl = a2.length; j2 < jl; j2++, k2++)
      r2[k2] = a2[j2];
  return r2;
}
function __await4(v2) {
  return this instanceof __await4 ? (this.v = v2, this) : new __await4(v2);
}
function __asyncGenerator4(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g2 = generator.apply(thisArg, _arguments || []), i2, q2 = [];
  return i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2;
  function verb(n2) {
    if (g2[n2]) i2[n2] = function(v2) {
      return new Promise(function(a2, b2) {
        q2.push([n2, v2, a2, b2]) > 1 || resume(n2, v2);
      });
    };
  }
  function resume(n2, v2) {
    try {
      step(g2[n2](v2));
    } catch (e2) {
      settle(q2[0][3], e2);
    }
  }
  function step(r2) {
    r2.value instanceof __await4 ? Promise.resolve(r2.value.v).then(fulfill, reject) : settle(q2[0][2], r2);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f2, v2) {
    if (f2(v2), q2.shift(), q2.length) resume(q2[0][0], q2[0][1]);
  }
}
function __asyncDelegator4(o2) {
  var i2, p2;
  return i2 = {}, verb("next"), verb("throw", function(e2) {
    throw e2;
  }), verb("return"), i2[Symbol.iterator] = function() {
    return this;
  }, i2;
  function verb(n2, f2) {
    i2[n2] = o2[n2] ? function(v2) {
      return (p2 = !p2) ? { value: __await4(o2[n2](v2)), done: n2 === "return" } : f2 ? f2(v2) : v2;
    } : f2;
  }
}
function __asyncValues4(o2) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m2 = o2[Symbol.asyncIterator], i2;
  return m2 ? m2.call(o2) : (o2 = typeof __values4 === "function" ? __values4(o2) : o2[Symbol.iterator](), i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2);
  function verb(n2) {
    i2[n2] = o2[n2] && function(v2) {
      return new Promise(function(resolve, reject) {
        v2 = o2[n2](v2), settle(resolve, reject, v2.done, v2.value);
      });
    };
  }
  function settle(resolve, reject, d2, v2) {
    Promise.resolve(v2).then(function(v3) {
      resolve({ value: v3, done: d2 });
    }, reject);
  }
}
function __makeTemplateObject4(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar4(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k2 in mod) if (Object.hasOwnProperty.call(mod, k2)) result[k2] = mod[k2];
  }
  result.default = mod;
  return result;
}
function __importDefault4(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet4(receiver, privateMap) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to get private field on non-instance");
  }
  return privateMap.get(receiver);
}
function __classPrivateFieldSet4(receiver, privateMap, value) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to set private field on non-instance");
  }
  privateMap.set(receiver, value);
  return value;
}
var extendStatics4, __assign4;
var init_tslib_es64 = __esm({
  "node_modules/@aws-crypto/sha256-browser/node_modules/tslib/tslib.es6.js"() {
    extendStatics4 = function(d2, b2) {
      extendStatics4 = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d3, b3) {
        d3.__proto__ = b3;
      } || function(d3, b3) {
        for (var p2 in b3) if (b3.hasOwnProperty(p2)) d3[p2] = b3[p2];
      };
      return extendStatics4(d2, b2);
    };
    __assign4 = function() {
      __assign4 = Object.assign || function __assign8(t2) {
        for (var s2, i2 = 1, n2 = arguments.length; i2 < n2; i2++) {
          s2 = arguments[i2];
          for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2)) t2[p2] = s2[p2];
        }
        return t2;
      };
      return __assign4.apply(this, arguments);
    };
  }
});

// node_modules/@aws-crypto/sha256-browser/build/isEmptyData.js
var require_isEmptyData3 = __commonJS({
  "node_modules/@aws-crypto/sha256-browser/build/isEmptyData.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isEmptyData = void 0;
    function isEmptyData2(data) {
      if (typeof data === "string") {
        return data.length === 0;
      }
      return data.byteLength === 0;
    }
    exports.isEmptyData = isEmptyData2;
  }
});

// node_modules/@aws-crypto/sha256-browser/build/constants.js
var require_constants2 = __commonJS({
  "node_modules/@aws-crypto/sha256-browser/build/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EMPTY_DATA_SHA_256 = exports.SHA_256_HMAC_ALGO = exports.SHA_256_HASH = void 0;
    exports.SHA_256_HASH = { name: "SHA-256" };
    exports.SHA_256_HMAC_ALGO = {
      name: "HMAC",
      hash: exports.SHA_256_HASH
    };
    exports.EMPTY_DATA_SHA_256 = new Uint8Array([
      227,
      176,
      196,
      66,
      152,
      252,
      28,
      20,
      154,
      251,
      244,
      200,
      153,
      111,
      185,
      36,
      39,
      174,
      65,
      228,
      100,
      155,
      147,
      76,
      164,
      149,
      153,
      27,
      120,
      82,
      184,
      85
    ]);
  }
});

// node_modules/@aws-crypto/sha256-browser/build/ie11Sha256.js
var require_ie11Sha256 = __commonJS({
  "node_modules/@aws-crypto/sha256-browser/build/ie11Sha256.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Sha256 = void 0;
    var isEmptyData_1 = require_isEmptyData3();
    var constants_1 = require_constants2();
    var util_utf8_browser_1 = require_dist_cjs();
    var util_locate_window_1 = require_dist_cjs2();
    var Sha2562 = (
      /** @class */
      (function() {
        function Sha2563(secret) {
          this.secret = secret;
          this.reset();
        }
        Sha2563.prototype.update = function(toHash) {
          var _this = this;
          if ((0, isEmptyData_1.isEmptyData)(toHash)) {
            return;
          }
          this.operation = this.operation.then(function(operation) {
            operation.onerror = function() {
              _this.operation = Promise.reject(new Error("Error encountered updating hash"));
            };
            operation.process(toArrayBufferView(toHash));
            return operation;
          });
          this.operation.catch(function() {
          });
        };
        Sha2563.prototype.digest = function() {
          return this.operation.then(function(operation) {
            return new Promise(function(resolve, reject) {
              operation.onerror = function() {
                reject(new Error("Error encountered finalizing hash"));
              };
              operation.oncomplete = function() {
                if (operation.result) {
                  resolve(new Uint8Array(operation.result));
                }
                reject(new Error("Error encountered finalizing hash"));
              };
              operation.finish();
            });
          });
        };
        Sha2563.prototype.reset = function() {
          if (this.secret) {
            this.operation = getKeyPromise(this.secret).then(function(keyData) {
              return (0, util_locate_window_1.locateWindow)().msCrypto.subtle.sign(constants_1.SHA_256_HMAC_ALGO, keyData);
            });
            this.operation.catch(function() {
            });
          } else {
            this.operation = Promise.resolve((0, util_locate_window_1.locateWindow)().msCrypto.subtle.digest("SHA-256"));
          }
        };
        return Sha2563;
      })()
    );
    exports.Sha256 = Sha2562;
    function getKeyPromise(secret) {
      return new Promise(function(resolve, reject) {
        var keyOperation = (0, util_locate_window_1.locateWindow)().msCrypto.subtle.importKey("raw", toArrayBufferView(secret), constants_1.SHA_256_HMAC_ALGO, false, ["sign"]);
        keyOperation.oncomplete = function() {
          if (keyOperation.result) {
            resolve(keyOperation.result);
          }
          reject(new Error("ImportKey completed without importing key."));
        };
        keyOperation.onerror = function() {
          reject(new Error("ImportKey failed to import key."));
        };
      });
    }
    function toArrayBufferView(data) {
      if (typeof data === "string") {
        return (0, util_utf8_browser_1.fromUtf8)(data);
      }
      if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
      }
      return new Uint8Array(data);
    }
  }
});

// node_modules/@aws-crypto/sha256-browser/build/webCryptoSha256.js
var require_webCryptoSha256 = __commonJS({
  "node_modules/@aws-crypto/sha256-browser/build/webCryptoSha256.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Sha256 = void 0;
    var util_1 = require_build3();
    var constants_1 = require_constants2();
    var util_locate_window_1 = require_dist_cjs2();
    var Sha2562 = (
      /** @class */
      (function() {
        function Sha2563(secret) {
          this.toHash = new Uint8Array(0);
          this.secret = secret;
          this.reset();
        }
        Sha2563.prototype.update = function(data) {
          if ((0, util_1.isEmptyData)(data)) {
            return;
          }
          var update = (0, util_1.convertToBuffer)(data);
          var typedArray = new Uint8Array(this.toHash.byteLength + update.byteLength);
          typedArray.set(this.toHash, 0);
          typedArray.set(update, this.toHash.byteLength);
          this.toHash = typedArray;
        };
        Sha2563.prototype.digest = function() {
          var _this = this;
          if (this.key) {
            return this.key.then(function(key) {
              return (0, util_locate_window_1.locateWindow)().crypto.subtle.sign(constants_1.SHA_256_HMAC_ALGO, key, _this.toHash).then(function(data) {
                return new Uint8Array(data);
              });
            });
          }
          if ((0, util_1.isEmptyData)(this.toHash)) {
            return Promise.resolve(constants_1.EMPTY_DATA_SHA_256);
          }
          return Promise.resolve().then(function() {
            return (0, util_locate_window_1.locateWindow)().crypto.subtle.digest(constants_1.SHA_256_HASH, _this.toHash);
          }).then(function(data) {
            return Promise.resolve(new Uint8Array(data));
          });
        };
        Sha2563.prototype.reset = function() {
          var _this = this;
          this.toHash = new Uint8Array(0);
          if (this.secret && this.secret !== void 0) {
            this.key = new Promise(function(resolve, reject) {
              (0, util_locate_window_1.locateWindow)().crypto.subtle.importKey("raw", (0, util_1.convertToBuffer)(_this.secret), constants_1.SHA_256_HMAC_ALGO, false, ["sign"]).then(resolve, reject);
            });
            this.key.catch(function() {
            });
          }
        };
        return Sha2563;
      })()
    );
    exports.Sha256 = Sha2562;
  }
});

// node_modules/@aws-crypto/sha256-js/node_modules/tslib/tslib.es6.js
var tslib_es6_exports5 = {};
__export(tslib_es6_exports5, {
  __assign: () => __assign5,
  __asyncDelegator: () => __asyncDelegator5,
  __asyncGenerator: () => __asyncGenerator5,
  __asyncValues: () => __asyncValues5,
  __await: () => __await5,
  __awaiter: () => __awaiter5,
  __classPrivateFieldGet: () => __classPrivateFieldGet5,
  __classPrivateFieldSet: () => __classPrivateFieldSet5,
  __createBinding: () => __createBinding5,
  __decorate: () => __decorate5,
  __exportStar: () => __exportStar5,
  __extends: () => __extends5,
  __generator: () => __generator5,
  __importDefault: () => __importDefault5,
  __importStar: () => __importStar5,
  __makeTemplateObject: () => __makeTemplateObject5,
  __metadata: () => __metadata5,
  __param: () => __param5,
  __read: () => __read5,
  __rest: () => __rest5,
  __spread: () => __spread5,
  __spreadArrays: () => __spreadArrays5,
  __values: () => __values5
});
function __extends5(d2, b2) {
  extendStatics5(d2, b2);
  function __() {
    this.constructor = d2;
  }
  d2.prototype = b2 === null ? Object.create(b2) : (__.prototype = b2.prototype, new __());
}
function __rest5(s2, e2) {
  var t2 = {};
  for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2) && e2.indexOf(p2) < 0)
    t2[p2] = s2[p2];
  if (s2 != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i2 = 0, p2 = Object.getOwnPropertySymbols(s2); i2 < p2.length; i2++) {
      if (e2.indexOf(p2[i2]) < 0 && Object.prototype.propertyIsEnumerable.call(s2, p2[i2]))
        t2[p2[i2]] = s2[p2[i2]];
    }
  return t2;
}
function __decorate5(decorators, target, key, desc) {
  var c2 = arguments.length, r2 = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d2;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r2 = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d2 = decorators[i2]) r2 = (c2 < 3 ? d2(r2) : c2 > 3 ? d2(target, key, r2) : d2(target, key)) || r2;
  return c2 > 3 && r2 && Object.defineProperty(target, key, r2), r2;
}
function __param5(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __metadata5(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter5(thisArg, _arguments, P2, generator) {
  function adopt(value) {
    return value instanceof P2 ? value : new P2(function(resolve) {
      resolve(value);
    });
  }
  return new (P2 || (P2 = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e2) {
        reject(e2);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e2) {
        reject(e2);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator5(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t2[0] & 1) throw t2[1];
    return t2[1];
  }, trys: [], ops: [] }, f2, y2, t2, g2;
  return g2 = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g2[Symbol.iterator] = function() {
    return this;
  }), g2;
  function verb(n2) {
    return function(v2) {
      return step([n2, v2]);
    };
  }
  function step(op) {
    if (f2) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f2 = 1, y2 && (t2 = op[0] & 2 ? y2["return"] : op[0] ? y2["throw"] || ((t2 = y2["return"]) && t2.call(y2), 0) : y2.next) && !(t2 = t2.call(y2, op[1])).done) return t2;
      if (y2 = 0, t2) op = [op[0] & 2, t2.value];
      switch (op[0]) {
        case 0:
        case 1:
          t2 = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y2 = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t2 = _.trys, t2 = t2.length > 0 && t2[t2.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t2 || op[1] > t2[0] && op[1] < t2[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t2[1]) {
            _.label = t2[1];
            t2 = op;
            break;
          }
          if (t2 && _.label < t2[2]) {
            _.label = t2[2];
            _.ops.push(op);
            break;
          }
          if (t2[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e2) {
      op = [6, e2];
      y2 = 0;
    } finally {
      f2 = t2 = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __createBinding5(o2, m2, k2, k22) {
  if (k22 === void 0) k22 = k2;
  o2[k22] = m2[k2];
}
function __exportStar5(m2, exports) {
  for (var p2 in m2) if (p2 !== "default" && !exports.hasOwnProperty(p2)) exports[p2] = m2[p2];
}
function __values5(o2) {
  var s2 = typeof Symbol === "function" && Symbol.iterator, m2 = s2 && o2[s2], i2 = 0;
  if (m2) return m2.call(o2);
  if (o2 && typeof o2.length === "number") return {
    next: function() {
      if (o2 && i2 >= o2.length) o2 = void 0;
      return { value: o2 && o2[i2++], done: !o2 };
    }
  };
  throw new TypeError(s2 ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read5(o2, n2) {
  var m2 = typeof Symbol === "function" && o2[Symbol.iterator];
  if (!m2) return o2;
  var i2 = m2.call(o2), r2, ar2 = [], e2;
  try {
    while ((n2 === void 0 || n2-- > 0) && !(r2 = i2.next()).done) ar2.push(r2.value);
  } catch (error) {
    e2 = { error };
  } finally {
    try {
      if (r2 && !r2.done && (m2 = i2["return"])) m2.call(i2);
    } finally {
      if (e2) throw e2.error;
    }
  }
  return ar2;
}
function __spread5() {
  for (var ar2 = [], i2 = 0; i2 < arguments.length; i2++)
    ar2 = ar2.concat(__read5(arguments[i2]));
  return ar2;
}
function __spreadArrays5() {
  for (var s2 = 0, i2 = 0, il = arguments.length; i2 < il; i2++) s2 += arguments[i2].length;
  for (var r2 = Array(s2), k2 = 0, i2 = 0; i2 < il; i2++)
    for (var a2 = arguments[i2], j2 = 0, jl = a2.length; j2 < jl; j2++, k2++)
      r2[k2] = a2[j2];
  return r2;
}
function __await5(v2) {
  return this instanceof __await5 ? (this.v = v2, this) : new __await5(v2);
}
function __asyncGenerator5(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g2 = generator.apply(thisArg, _arguments || []), i2, q2 = [];
  return i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2;
  function verb(n2) {
    if (g2[n2]) i2[n2] = function(v2) {
      return new Promise(function(a2, b2) {
        q2.push([n2, v2, a2, b2]) > 1 || resume(n2, v2);
      });
    };
  }
  function resume(n2, v2) {
    try {
      step(g2[n2](v2));
    } catch (e2) {
      settle(q2[0][3], e2);
    }
  }
  function step(r2) {
    r2.value instanceof __await5 ? Promise.resolve(r2.value.v).then(fulfill, reject) : settle(q2[0][2], r2);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f2, v2) {
    if (f2(v2), q2.shift(), q2.length) resume(q2[0][0], q2[0][1]);
  }
}
function __asyncDelegator5(o2) {
  var i2, p2;
  return i2 = {}, verb("next"), verb("throw", function(e2) {
    throw e2;
  }), verb("return"), i2[Symbol.iterator] = function() {
    return this;
  }, i2;
  function verb(n2, f2) {
    i2[n2] = o2[n2] ? function(v2) {
      return (p2 = !p2) ? { value: __await5(o2[n2](v2)), done: n2 === "return" } : f2 ? f2(v2) : v2;
    } : f2;
  }
}
function __asyncValues5(o2) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m2 = o2[Symbol.asyncIterator], i2;
  return m2 ? m2.call(o2) : (o2 = typeof __values5 === "function" ? __values5(o2) : o2[Symbol.iterator](), i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2);
  function verb(n2) {
    i2[n2] = o2[n2] && function(v2) {
      return new Promise(function(resolve, reject) {
        v2 = o2[n2](v2), settle(resolve, reject, v2.done, v2.value);
      });
    };
  }
  function settle(resolve, reject, d2, v2) {
    Promise.resolve(v2).then(function(v3) {
      resolve({ value: v3, done: d2 });
    }, reject);
  }
}
function __makeTemplateObject5(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar5(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k2 in mod) if (Object.hasOwnProperty.call(mod, k2)) result[k2] = mod[k2];
  }
  result.default = mod;
  return result;
}
function __importDefault5(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet5(receiver, privateMap) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to get private field on non-instance");
  }
  return privateMap.get(receiver);
}
function __classPrivateFieldSet5(receiver, privateMap, value) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to set private field on non-instance");
  }
  privateMap.set(receiver, value);
  return value;
}
var extendStatics5, __assign5;
var init_tslib_es65 = __esm({
  "node_modules/@aws-crypto/sha256-js/node_modules/tslib/tslib.es6.js"() {
    extendStatics5 = function(d2, b2) {
      extendStatics5 = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d3, b3) {
        d3.__proto__ = b3;
      } || function(d3, b3) {
        for (var p2 in b3) if (b3.hasOwnProperty(p2)) d3[p2] = b3[p2];
      };
      return extendStatics5(d2, b2);
    };
    __assign5 = function() {
      __assign5 = Object.assign || function __assign8(t2) {
        for (var s2, i2 = 1, n2 = arguments.length; i2 < n2; i2++) {
          s2 = arguments[i2];
          for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2)) t2[p2] = s2[p2];
        }
        return t2;
      };
      return __assign5.apply(this, arguments);
    };
  }
});

// node_modules/@aws-crypto/sha256-js/build/constants.js
var require_constants3 = __commonJS({
  "node_modules/@aws-crypto/sha256-js/build/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MAX_HASHABLE_LENGTH = exports.INIT = exports.KEY = exports.DIGEST_LENGTH = exports.BLOCK_SIZE = void 0;
    exports.BLOCK_SIZE = 64;
    exports.DIGEST_LENGTH = 32;
    exports.KEY = new Uint32Array([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]);
    exports.INIT = [
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ];
    exports.MAX_HASHABLE_LENGTH = Math.pow(2, 53) - 1;
  }
});

// node_modules/@aws-crypto/sha256-js/build/RawSha256.js
var require_RawSha256 = __commonJS({
  "node_modules/@aws-crypto/sha256-js/build/RawSha256.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RawSha256 = void 0;
    var constants_1 = require_constants3();
    var RawSha256 = (
      /** @class */
      (function() {
        function RawSha2562() {
          this.state = Int32Array.from(constants_1.INIT);
          this.temp = new Int32Array(64);
          this.buffer = new Uint8Array(64);
          this.bufferLength = 0;
          this.bytesHashed = 0;
          this.finished = false;
        }
        RawSha2562.prototype.update = function(data) {
          if (this.finished) {
            throw new Error("Attempted to update an already finished hash.");
          }
          var position = 0;
          var byteLength = data.byteLength;
          this.bytesHashed += byteLength;
          if (this.bytesHashed * 8 > constants_1.MAX_HASHABLE_LENGTH) {
            throw new Error("Cannot hash more than 2^53 - 1 bits");
          }
          while (byteLength > 0) {
            this.buffer[this.bufferLength++] = data[position++];
            byteLength--;
            if (this.bufferLength === constants_1.BLOCK_SIZE) {
              this.hashBuffer();
              this.bufferLength = 0;
            }
          }
        };
        RawSha2562.prototype.digest = function() {
          if (!this.finished) {
            var bitsHashed = this.bytesHashed * 8;
            var bufferView = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
            var undecoratedLength = this.bufferLength;
            bufferView.setUint8(this.bufferLength++, 128);
            if (undecoratedLength % constants_1.BLOCK_SIZE >= constants_1.BLOCK_SIZE - 8) {
              for (var i2 = this.bufferLength; i2 < constants_1.BLOCK_SIZE; i2++) {
                bufferView.setUint8(i2, 0);
              }
              this.hashBuffer();
              this.bufferLength = 0;
            }
            for (var i2 = this.bufferLength; i2 < constants_1.BLOCK_SIZE - 8; i2++) {
              bufferView.setUint8(i2, 0);
            }
            bufferView.setUint32(constants_1.BLOCK_SIZE - 8, Math.floor(bitsHashed / 4294967296), true);
            bufferView.setUint32(constants_1.BLOCK_SIZE - 4, bitsHashed);
            this.hashBuffer();
            this.finished = true;
          }
          var out = new Uint8Array(constants_1.DIGEST_LENGTH);
          for (var i2 = 0; i2 < 8; i2++) {
            out[i2 * 4] = this.state[i2] >>> 24 & 255;
            out[i2 * 4 + 1] = this.state[i2] >>> 16 & 255;
            out[i2 * 4 + 2] = this.state[i2] >>> 8 & 255;
            out[i2 * 4 + 3] = this.state[i2] >>> 0 & 255;
          }
          return out;
        };
        RawSha2562.prototype.hashBuffer = function() {
          var _a = this, buffer = _a.buffer, state = _a.state;
          var state0 = state[0], state1 = state[1], state2 = state[2], state3 = state[3], state4 = state[4], state5 = state[5], state6 = state[6], state7 = state[7];
          for (var i2 = 0; i2 < constants_1.BLOCK_SIZE; i2++) {
            if (i2 < 16) {
              this.temp[i2] = (buffer[i2 * 4] & 255) << 24 | (buffer[i2 * 4 + 1] & 255) << 16 | (buffer[i2 * 4 + 2] & 255) << 8 | buffer[i2 * 4 + 3] & 255;
            } else {
              var u2 = this.temp[i2 - 2];
              var t1_1 = (u2 >>> 17 | u2 << 15) ^ (u2 >>> 19 | u2 << 13) ^ u2 >>> 10;
              u2 = this.temp[i2 - 15];
              var t2_1 = (u2 >>> 7 | u2 << 25) ^ (u2 >>> 18 | u2 << 14) ^ u2 >>> 3;
              this.temp[i2] = (t1_1 + this.temp[i2 - 7] | 0) + (t2_1 + this.temp[i2 - 16] | 0);
            }
            var t1 = (((state4 >>> 6 | state4 << 26) ^ (state4 >>> 11 | state4 << 21) ^ (state4 >>> 25 | state4 << 7)) + (state4 & state5 ^ ~state4 & state6) | 0) + (state7 + (constants_1.KEY[i2] + this.temp[i2] | 0) | 0) | 0;
            var t2 = ((state0 >>> 2 | state0 << 30) ^ (state0 >>> 13 | state0 << 19) ^ (state0 >>> 22 | state0 << 10)) + (state0 & state1 ^ state0 & state2 ^ state1 & state2) | 0;
            state7 = state6;
            state6 = state5;
            state5 = state4;
            state4 = state3 + t1 | 0;
            state3 = state2;
            state2 = state1;
            state1 = state0;
            state0 = t1 + t2 | 0;
          }
          state[0] += state0;
          state[1] += state1;
          state[2] += state2;
          state[3] += state3;
          state[4] += state4;
          state[5] += state5;
          state[6] += state6;
          state[7] += state7;
        };
        return RawSha2562;
      })()
    );
    exports.RawSha256 = RawSha256;
  }
});

// node_modules/@aws-crypto/sha256-js/build/jsSha256.js
var require_jsSha256 = __commonJS({
  "node_modules/@aws-crypto/sha256-js/build/jsSha256.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Sha256 = void 0;
    var tslib_1 = (init_tslib_es65(), __toCommonJS(tslib_es6_exports5));
    var constants_1 = require_constants3();
    var RawSha256_1 = require_RawSha256();
    var util_1 = require_build3();
    var Sha2562 = (
      /** @class */
      (function() {
        function Sha2563(secret) {
          this.secret = secret;
          this.hash = new RawSha256_1.RawSha256();
          this.reset();
        }
        Sha2563.prototype.update = function(toHash) {
          if ((0, util_1.isEmptyData)(toHash) || this.error) {
            return;
          }
          try {
            this.hash.update((0, util_1.convertToBuffer)(toHash));
          } catch (e2) {
            this.error = e2;
          }
        };
        Sha2563.prototype.digestSync = function() {
          if (this.error) {
            throw this.error;
          }
          if (this.outer) {
            if (!this.outer.finished) {
              this.outer.update(this.hash.digest());
            }
            return this.outer.digest();
          }
          return this.hash.digest();
        };
        Sha2563.prototype.digest = function() {
          return tslib_1.__awaiter(this, void 0, void 0, function() {
            return tslib_1.__generator(this, function(_a) {
              return [2, this.digestSync()];
            });
          });
        };
        Sha2563.prototype.reset = function() {
          this.hash = new RawSha256_1.RawSha256();
          if (this.secret) {
            this.outer = new RawSha256_1.RawSha256();
            var inner = bufferFromSecret(this.secret);
            var outer = new Uint8Array(constants_1.BLOCK_SIZE);
            outer.set(inner);
            for (var i2 = 0; i2 < constants_1.BLOCK_SIZE; i2++) {
              inner[i2] ^= 54;
              outer[i2] ^= 92;
            }
            this.hash.update(inner);
            this.outer.update(outer);
            for (var i2 = 0; i2 < inner.byteLength; i2++) {
              inner[i2] = 0;
            }
          }
        };
        return Sha2563;
      })()
    );
    exports.Sha256 = Sha2562;
    function bufferFromSecret(secret) {
      var input = (0, util_1.convertToBuffer)(secret);
      if (input.byteLength > constants_1.BLOCK_SIZE) {
        var bufferHash = new RawSha256_1.RawSha256();
        bufferHash.update(input);
        input = bufferHash.digest();
      }
      var buffer = new Uint8Array(constants_1.BLOCK_SIZE);
      buffer.set(input);
      return buffer;
    }
  }
});

// node_modules/@aws-crypto/sha256-js/build/index.js
var require_build5 = __commonJS({
  "node_modules/@aws-crypto/sha256-js/build/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es65(), __toCommonJS(tslib_es6_exports5));
    tslib_1.__exportStar(require_jsSha256(), exports);
  }
});

// node_modules/@aws-crypto/sha256-browser/build/crossPlatformSha256.js
var require_crossPlatformSha256 = __commonJS({
  "node_modules/@aws-crypto/sha256-browser/build/crossPlatformSha256.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Sha256 = void 0;
    var ie11Sha256_1 = require_ie11Sha256();
    var webCryptoSha256_1 = require_webCryptoSha256();
    var sha256_js_1 = require_build5();
    var supports_web_crypto_1 = require_build();
    var ie11_detection_1 = require_build2();
    var util_locate_window_1 = require_dist_cjs2();
    var util_1 = require_build3();
    var Sha2562 = (
      /** @class */
      (function() {
        function Sha2563(secret) {
          if ((0, supports_web_crypto_1.supportsWebCrypto)((0, util_locate_window_1.locateWindow)())) {
            this.hash = new webCryptoSha256_1.Sha256(secret);
          } else if ((0, ie11_detection_1.isMsWindow)((0, util_locate_window_1.locateWindow)())) {
            this.hash = new ie11Sha256_1.Sha256(secret);
          } else {
            this.hash = new sha256_js_1.Sha256(secret);
          }
        }
        Sha2563.prototype.update = function(data, encoding) {
          this.hash.update((0, util_1.convertToBuffer)(data));
        };
        Sha2563.prototype.digest = function() {
          return this.hash.digest();
        };
        Sha2563.prototype.reset = function() {
          this.hash.reset();
        };
        return Sha2563;
      })()
    );
    exports.Sha256 = Sha2562;
  }
});

// node_modules/@aws-crypto/sha256-browser/build/index.js
var require_build6 = __commonJS({
  "node_modules/@aws-crypto/sha256-browser/build/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WebCryptoSha256 = exports.Ie11Sha256 = void 0;
    var tslib_1 = (init_tslib_es64(), __toCommonJS(tslib_es6_exports4));
    tslib_1.__exportStar(require_crossPlatformSha256(), exports);
    var ie11Sha256_1 = require_ie11Sha256();
    Object.defineProperty(exports, "Ie11Sha256", { enumerable: true, get: function() {
      return ie11Sha256_1.Sha256;
    } });
    var webCryptoSha256_1 = require_webCryptoSha256();
    Object.defineProperty(exports, "WebCryptoSha256", { enumerable: true, get: function() {
      return webCryptoSha256_1.Sha256;
    } });
  }
});

// node_modules/bowser/es5.js
var require_es5 = __commonJS({
  "node_modules/bowser/es5.js"(exports, module) {
    !(function(e2, t2) {
      "object" == typeof exports && "object" == typeof module ? module.exports = t2() : "function" == typeof define && define.amd ? define([], t2) : "object" == typeof exports ? exports.bowser = t2() : e2.bowser = t2();
    })(exports, (function() {
      return (function(e2) {
        var t2 = {};
        function r2(i2) {
          if (t2[i2]) return t2[i2].exports;
          var n2 = t2[i2] = { i: i2, l: false, exports: {} };
          return e2[i2].call(n2.exports, n2, n2.exports, r2), n2.l = true, n2.exports;
        }
        return r2.m = e2, r2.c = t2, r2.d = function(e3, t3, i2) {
          r2.o(e3, t3) || Object.defineProperty(e3, t3, { enumerable: true, get: i2 });
        }, r2.r = function(e3) {
          "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(e3, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(e3, "__esModule", { value: true });
        }, r2.t = function(e3, t3) {
          if (1 & t3 && (e3 = r2(e3)), 8 & t3) return e3;
          if (4 & t3 && "object" == typeof e3 && e3 && e3.__esModule) return e3;
          var i2 = /* @__PURE__ */ Object.create(null);
          if (r2.r(i2), Object.defineProperty(i2, "default", { enumerable: true, value: e3 }), 2 & t3 && "string" != typeof e3) for (var n2 in e3) r2.d(i2, n2, function(t4) {
            return e3[t4];
          }.bind(null, n2));
          return i2;
        }, r2.n = function(e3) {
          var t3 = e3 && e3.__esModule ? function() {
            return e3.default;
          } : function() {
            return e3;
          };
          return r2.d(t3, "a", t3), t3;
        }, r2.o = function(e3, t3) {
          return Object.prototype.hasOwnProperty.call(e3, t3);
        }, r2.p = "", r2(r2.s = 90);
      })({ 17: function(e2, t2, r2) {
        "use strict";
        t2.__esModule = true, t2.default = void 0;
        var i2 = r2(18), n2 = (function() {
          function e3() {
          }
          return e3.getFirstMatch = function(e4, t3) {
            var r3 = t3.match(e4);
            return r3 && r3.length > 0 && r3[1] || "";
          }, e3.getSecondMatch = function(e4, t3) {
            var r3 = t3.match(e4);
            return r3 && r3.length > 1 && r3[2] || "";
          }, e3.matchAndReturnConst = function(e4, t3, r3) {
            if (e4.test(t3)) return r3;
          }, e3.getWindowsVersionName = function(e4) {
            switch (e4) {
              case "NT":
                return "NT";
              case "XP":
                return "XP";
              case "NT 5.0":
                return "2000";
              case "NT 5.1":
                return "XP";
              case "NT 5.2":
                return "2003";
              case "NT 6.0":
                return "Vista";
              case "NT 6.1":
                return "7";
              case "NT 6.2":
                return "8";
              case "NT 6.3":
                return "8.1";
              case "NT 10.0":
                return "10";
              default:
                return;
            }
          }, e3.getMacOSVersionName = function(e4) {
            var t3 = e4.split(".").splice(0, 2).map((function(e5) {
              return parseInt(e5, 10) || 0;
            }));
            t3.push(0);
            var r3 = t3[0], i3 = t3[1];
            if (10 === r3) switch (i3) {
              case 5:
                return "Leopard";
              case 6:
                return "Snow Leopard";
              case 7:
                return "Lion";
              case 8:
                return "Mountain Lion";
              case 9:
                return "Mavericks";
              case 10:
                return "Yosemite";
              case 11:
                return "El Capitan";
              case 12:
                return "Sierra";
              case 13:
                return "High Sierra";
              case 14:
                return "Mojave";
              case 15:
                return "Catalina";
              default:
                return;
            }
            switch (r3) {
              case 11:
                return "Big Sur";
              case 12:
                return "Monterey";
              case 13:
                return "Ventura";
              case 14:
                return "Sonoma";
              case 15:
                return "Sequoia";
              default:
                return;
            }
          }, e3.getAndroidVersionName = function(e4) {
            var t3 = e4.split(".").splice(0, 2).map((function(e5) {
              return parseInt(e5, 10) || 0;
            }));
            if (t3.push(0), !(1 === t3[0] && t3[1] < 5)) return 1 === t3[0] && t3[1] < 6 ? "Cupcake" : 1 === t3[0] && t3[1] >= 6 ? "Donut" : 2 === t3[0] && t3[1] < 2 ? "Eclair" : 2 === t3[0] && 2 === t3[1] ? "Froyo" : 2 === t3[0] && t3[1] > 2 ? "Gingerbread" : 3 === t3[0] ? "Honeycomb" : 4 === t3[0] && t3[1] < 1 ? "Ice Cream Sandwich" : 4 === t3[0] && t3[1] < 4 ? "Jelly Bean" : 4 === t3[0] && t3[1] >= 4 ? "KitKat" : 5 === t3[0] ? "Lollipop" : 6 === t3[0] ? "Marshmallow" : 7 === t3[0] ? "Nougat" : 8 === t3[0] ? "Oreo" : 9 === t3[0] ? "Pie" : void 0;
          }, e3.getVersionPrecision = function(e4) {
            return e4.split(".").length;
          }, e3.compareVersions = function(t3, r3, i3) {
            void 0 === i3 && (i3 = false);
            var n3 = e3.getVersionPrecision(t3), a2 = e3.getVersionPrecision(r3), o2 = Math.max(n3, a2), s2 = 0, u2 = e3.map([t3, r3], (function(t4) {
              var r4 = o2 - e3.getVersionPrecision(t4), i4 = t4 + new Array(r4 + 1).join(".0");
              return e3.map(i4.split("."), (function(e4) {
                return new Array(20 - e4.length).join("0") + e4;
              })).reverse();
            }));
            for (i3 && (s2 = o2 - Math.min(n3, a2)), o2 -= 1; o2 >= s2; ) {
              if (u2[0][o2] > u2[1][o2]) return 1;
              if (u2[0][o2] === u2[1][o2]) {
                if (o2 === s2) return 0;
                o2 -= 1;
              } else if (u2[0][o2] < u2[1][o2]) return -1;
            }
          }, e3.map = function(e4, t3) {
            var r3, i3 = [];
            if (Array.prototype.map) return Array.prototype.map.call(e4, t3);
            for (r3 = 0; r3 < e4.length; r3 += 1) i3.push(t3(e4[r3]));
            return i3;
          }, e3.find = function(e4, t3) {
            var r3, i3;
            if (Array.prototype.find) return Array.prototype.find.call(e4, t3);
            for (r3 = 0, i3 = e4.length; r3 < i3; r3 += 1) {
              var n3 = e4[r3];
              if (t3(n3, r3)) return n3;
            }
          }, e3.assign = function(e4) {
            for (var t3, r3, i3 = e4, n3 = arguments.length, a2 = new Array(n3 > 1 ? n3 - 1 : 0), o2 = 1; o2 < n3; o2++) a2[o2 - 1] = arguments[o2];
            if (Object.assign) return Object.assign.apply(Object, [e4].concat(a2));
            var s2 = function() {
              var e5 = a2[t3];
              "object" == typeof e5 && null !== e5 && Object.keys(e5).forEach((function(t4) {
                i3[t4] = e5[t4];
              }));
            };
            for (t3 = 0, r3 = a2.length; t3 < r3; t3 += 1) s2();
            return e4;
          }, e3.getBrowserAlias = function(e4) {
            return i2.BROWSER_ALIASES_MAP[e4];
          }, e3.getBrowserTypeByAlias = function(e4) {
            return i2.BROWSER_MAP[e4] || "";
          }, e3;
        })();
        t2.default = n2, e2.exports = t2.default;
      }, 18: function(e2, t2, r2) {
        "use strict";
        t2.__esModule = true, t2.ENGINE_MAP = t2.OS_MAP = t2.PLATFORMS_MAP = t2.BROWSER_MAP = t2.BROWSER_ALIASES_MAP = void 0;
        t2.BROWSER_ALIASES_MAP = { AmazonBot: "amazonbot", "Amazon Silk": "amazon_silk", "Android Browser": "android", BaiduSpider: "baiduspider", Bada: "bada", BingCrawler: "bingcrawler", Brave: "brave", BlackBerry: "blackberry", "ChatGPT-User": "chatgpt_user", Chrome: "chrome", ClaudeBot: "claudebot", Chromium: "chromium", Diffbot: "diffbot", DuckDuckBot: "duckduckbot", DuckDuckGo: "duckduckgo", Electron: "electron", Epiphany: "epiphany", FacebookExternalHit: "facebookexternalhit", Firefox: "firefox", Focus: "focus", Generic: "generic", "Google Search": "google_search", Googlebot: "googlebot", GPTBot: "gptbot", "Internet Explorer": "ie", InternetArchiveCrawler: "internetarchivecrawler", "K-Meleon": "k_meleon", LibreWolf: "librewolf", Linespider: "linespider", Maxthon: "maxthon", "Meta-ExternalAds": "meta_externalads", "Meta-ExternalAgent": "meta_externalagent", "Meta-ExternalFetcher": "meta_externalfetcher", "Meta-WebIndexer": "meta_webindexer", "Microsoft Edge": "edge", "MZ Browser": "mz", "NAVER Whale Browser": "naver", "OAI-SearchBot": "oai_searchbot", Omgilibot: "omgilibot", Opera: "opera", "Opera Coast": "opera_coast", "Pale Moon": "pale_moon", PerplexityBot: "perplexitybot", "Perplexity-User": "perplexity_user", PhantomJS: "phantomjs", PingdomBot: "pingdombot", Puffin: "puffin", QQ: "qq", QQLite: "qqlite", QupZilla: "qupzilla", Roku: "roku", Safari: "safari", Sailfish: "sailfish", "Samsung Internet for Android": "samsung_internet", SlackBot: "slackbot", SeaMonkey: "seamonkey", Sleipnir: "sleipnir", "Sogou Browser": "sogou", Swing: "swing", Tizen: "tizen", "UC Browser": "uc", Vivaldi: "vivaldi", "WebOS Browser": "webos", WeChat: "wechat", YahooSlurp: "yahooslurp", "Yandex Browser": "yandex", YandexBot: "yandexbot", YouBot: "youbot" };
        t2.BROWSER_MAP = { amazonbot: "AmazonBot", amazon_silk: "Amazon Silk", android: "Android Browser", baiduspider: "BaiduSpider", bada: "Bada", bingcrawler: "BingCrawler", blackberry: "BlackBerry", brave: "Brave", chatgpt_user: "ChatGPT-User", chrome: "Chrome", claudebot: "ClaudeBot", chromium: "Chromium", diffbot: "Diffbot", duckduckbot: "DuckDuckBot", duckduckgo: "DuckDuckGo", edge: "Microsoft Edge", electron: "Electron", epiphany: "Epiphany", facebookexternalhit: "FacebookExternalHit", firefox: "Firefox", focus: "Focus", generic: "Generic", google_search: "Google Search", googlebot: "Googlebot", gptbot: "GPTBot", ie: "Internet Explorer", internetarchivecrawler: "InternetArchiveCrawler", k_meleon: "K-Meleon", librewolf: "LibreWolf", linespider: "Linespider", maxthon: "Maxthon", meta_externalads: "Meta-ExternalAds", meta_externalagent: "Meta-ExternalAgent", meta_externalfetcher: "Meta-ExternalFetcher", meta_webindexer: "Meta-WebIndexer", mz: "MZ Browser", naver: "NAVER Whale Browser", oai_searchbot: "OAI-SearchBot", omgilibot: "Omgilibot", opera: "Opera", opera_coast: "Opera Coast", pale_moon: "Pale Moon", perplexitybot: "PerplexityBot", perplexity_user: "Perplexity-User", phantomjs: "PhantomJS", pingdombot: "PingdomBot", puffin: "Puffin", qq: "QQ Browser", qqlite: "QQ Browser Lite", qupzilla: "QupZilla", roku: "Roku", safari: "Safari", sailfish: "Sailfish", samsung_internet: "Samsung Internet for Android", seamonkey: "SeaMonkey", slackbot: "SlackBot", sleipnir: "Sleipnir", sogou: "Sogou Browser", swing: "Swing", tizen: "Tizen", uc: "UC Browser", vivaldi: "Vivaldi", webos: "WebOS Browser", wechat: "WeChat", yahooslurp: "YahooSlurp", yandex: "Yandex Browser", yandexbot: "YandexBot", youbot: "YouBot" };
        t2.PLATFORMS_MAP = { bot: "bot", desktop: "desktop", mobile: "mobile", tablet: "tablet", tv: "tv" };
        t2.OS_MAP = { Android: "Android", Bada: "Bada", BlackBerry: "BlackBerry", ChromeOS: "Chrome OS", HarmonyOS: "HarmonyOS", iOS: "iOS", Linux: "Linux", MacOS: "macOS", PlayStation4: "PlayStation 4", Roku: "Roku", Tizen: "Tizen", WebOS: "WebOS", Windows: "Windows", WindowsPhone: "Windows Phone" };
        t2.ENGINE_MAP = { Blink: "Blink", EdgeHTML: "EdgeHTML", Gecko: "Gecko", Presto: "Presto", Trident: "Trident", WebKit: "WebKit" };
      }, 90: function(e2, t2, r2) {
        "use strict";
        t2.__esModule = true, t2.default = void 0;
        var i2, n2 = (i2 = r2(91)) && i2.__esModule ? i2 : { default: i2 }, a2 = r2(18);
        function o2(e3, t3) {
          for (var r3 = 0; r3 < t3.length; r3++) {
            var i3 = t3[r3];
            i3.enumerable = i3.enumerable || false, i3.configurable = true, "value" in i3 && (i3.writable = true), Object.defineProperty(e3, i3.key, i3);
          }
        }
        var s2 = (function() {
          function e3() {
          }
          var t3, r3, i3;
          return e3.getParser = function(e4, t4, r4) {
            if (void 0 === t4 && (t4 = false), void 0 === r4 && (r4 = null), "string" != typeof e4) throw new Error("UserAgent should be a string");
            return new n2.default(e4, t4, r4);
          }, e3.parse = function(e4, t4) {
            return void 0 === t4 && (t4 = null), new n2.default(e4, t4).getResult();
          }, t3 = e3, i3 = [{ key: "BROWSER_MAP", get: function() {
            return a2.BROWSER_MAP;
          } }, { key: "ENGINE_MAP", get: function() {
            return a2.ENGINE_MAP;
          } }, { key: "OS_MAP", get: function() {
            return a2.OS_MAP;
          } }, { key: "PLATFORMS_MAP", get: function() {
            return a2.PLATFORMS_MAP;
          } }], (r3 = null) && o2(t3.prototype, r3), i3 && o2(t3, i3), e3;
        })();
        t2.default = s2, e2.exports = t2.default;
      }, 91: function(e2, t2, r2) {
        "use strict";
        t2.__esModule = true, t2.default = void 0;
        var i2 = u2(r2(92)), n2 = u2(r2(93)), a2 = u2(r2(94)), o2 = u2(r2(95)), s2 = u2(r2(17));
        function u2(e3) {
          return e3 && e3.__esModule ? e3 : { default: e3 };
        }
        var d2 = (function() {
          function e3(e4, t4, r3) {
            if (void 0 === t4 && (t4 = false), void 0 === r3 && (r3 = null), null == e4 || "" === e4) throw new Error("UserAgent parameter can't be empty");
            this._ua = e4;
            var i3 = false;
            "boolean" == typeof t4 ? (i3 = t4, this._hints = r3) : this._hints = null != t4 && "object" == typeof t4 ? t4 : null, this.parsedResult = {}, true !== i3 && this.parse();
          }
          var t3 = e3.prototype;
          return t3.getHints = function() {
            return this._hints;
          }, t3.hasBrand = function(e4) {
            if (!this._hints || !Array.isArray(this._hints.brands)) return false;
            var t4 = e4.toLowerCase();
            return this._hints.brands.some((function(e5) {
              return e5.brand && e5.brand.toLowerCase() === t4;
            }));
          }, t3.getBrandVersion = function(e4) {
            if (this._hints && Array.isArray(this._hints.brands)) {
              var t4 = e4.toLowerCase(), r3 = this._hints.brands.find((function(e5) {
                return e5.brand && e5.brand.toLowerCase() === t4;
              }));
              return r3 ? r3.version : void 0;
            }
          }, t3.getUA = function() {
            return this._ua;
          }, t3.test = function(e4) {
            return e4.test(this._ua);
          }, t3.parseBrowser = function() {
            var e4 = this;
            this.parsedResult.browser = {};
            var t4 = s2.default.find(i2.default, (function(t5) {
              if ("function" == typeof t5.test) return t5.test(e4);
              if (Array.isArray(t5.test)) return t5.test.some((function(t6) {
                return e4.test(t6);
              }));
              throw new Error("Browser's test function is not valid");
            }));
            return t4 && (this.parsedResult.browser = t4.describe(this.getUA(), this)), this.parsedResult.browser;
          }, t3.getBrowser = function() {
            return this.parsedResult.browser ? this.parsedResult.browser : this.parseBrowser();
          }, t3.getBrowserName = function(e4) {
            return e4 ? String(this.getBrowser().name).toLowerCase() || "" : this.getBrowser().name || "";
          }, t3.getBrowserVersion = function() {
            return this.getBrowser().version;
          }, t3.getOS = function() {
            return this.parsedResult.os ? this.parsedResult.os : this.parseOS();
          }, t3.parseOS = function() {
            var e4 = this;
            this.parsedResult.os = {};
            var t4 = s2.default.find(n2.default, (function(t5) {
              if ("function" == typeof t5.test) return t5.test(e4);
              if (Array.isArray(t5.test)) return t5.test.some((function(t6) {
                return e4.test(t6);
              }));
              throw new Error("Browser's test function is not valid");
            }));
            return t4 && (this.parsedResult.os = t4.describe(this.getUA())), this.parsedResult.os;
          }, t3.getOSName = function(e4) {
            var t4 = this.getOS().name;
            return e4 ? String(t4).toLowerCase() || "" : t4 || "";
          }, t3.getOSVersion = function() {
            return this.getOS().version;
          }, t3.getPlatform = function() {
            return this.parsedResult.platform ? this.parsedResult.platform : this.parsePlatform();
          }, t3.getPlatformType = function(e4) {
            void 0 === e4 && (e4 = false);
            var t4 = this.getPlatform().type;
            return e4 ? String(t4).toLowerCase() || "" : t4 || "";
          }, t3.parsePlatform = function() {
            var e4 = this;
            this.parsedResult.platform = {};
            var t4 = s2.default.find(a2.default, (function(t5) {
              if ("function" == typeof t5.test) return t5.test(e4);
              if (Array.isArray(t5.test)) return t5.test.some((function(t6) {
                return e4.test(t6);
              }));
              throw new Error("Browser's test function is not valid");
            }));
            return t4 && (this.parsedResult.platform = t4.describe(this.getUA())), this.parsedResult.platform;
          }, t3.getEngine = function() {
            return this.parsedResult.engine ? this.parsedResult.engine : this.parseEngine();
          }, t3.getEngineName = function(e4) {
            return e4 ? String(this.getEngine().name).toLowerCase() || "" : this.getEngine().name || "";
          }, t3.parseEngine = function() {
            var e4 = this;
            this.parsedResult.engine = {};
            var t4 = s2.default.find(o2.default, (function(t5) {
              if ("function" == typeof t5.test) return t5.test(e4);
              if (Array.isArray(t5.test)) return t5.test.some((function(t6) {
                return e4.test(t6);
              }));
              throw new Error("Browser's test function is not valid");
            }));
            return t4 && (this.parsedResult.engine = t4.describe(this.getUA())), this.parsedResult.engine;
          }, t3.parse = function() {
            return this.parseBrowser(), this.parseOS(), this.parsePlatform(), this.parseEngine(), this;
          }, t3.getResult = function() {
            return s2.default.assign({}, this.parsedResult);
          }, t3.satisfies = function(e4) {
            var t4 = this, r3 = {}, i3 = 0, n3 = {}, a3 = 0;
            if (Object.keys(e4).forEach((function(t5) {
              var o4 = e4[t5];
              "string" == typeof o4 ? (n3[t5] = o4, a3 += 1) : "object" == typeof o4 && (r3[t5] = o4, i3 += 1);
            })), i3 > 0) {
              var o3 = Object.keys(r3), u3 = s2.default.find(o3, (function(e5) {
                return t4.isOS(e5);
              }));
              if (u3) {
                var d3 = this.satisfies(r3[u3]);
                if (void 0 !== d3) return d3;
              }
              var c2 = s2.default.find(o3, (function(e5) {
                return t4.isPlatform(e5);
              }));
              if (c2) {
                var f2 = this.satisfies(r3[c2]);
                if (void 0 !== f2) return f2;
              }
            }
            if (a3 > 0) {
              var l2 = Object.keys(n3), b2 = s2.default.find(l2, (function(e5) {
                return t4.isBrowser(e5, true);
              }));
              if (void 0 !== b2) return this.compareVersion(n3[b2]);
            }
          }, t3.isBrowser = function(e4, t4) {
            void 0 === t4 && (t4 = false);
            var r3 = this.getBrowserName().toLowerCase(), i3 = e4.toLowerCase(), n3 = s2.default.getBrowserTypeByAlias(i3);
            return t4 && n3 && (i3 = n3.toLowerCase()), i3 === r3;
          }, t3.compareVersion = function(e4) {
            var t4 = [0], r3 = e4, i3 = false, n3 = this.getBrowserVersion();
            if ("string" == typeof n3) return ">" === e4[0] || "<" === e4[0] ? (r3 = e4.substr(1), "=" === e4[1] ? (i3 = true, r3 = e4.substr(2)) : t4 = [], ">" === e4[0] ? t4.push(1) : t4.push(-1)) : "=" === e4[0] ? r3 = e4.substr(1) : "~" === e4[0] && (i3 = true, r3 = e4.substr(1)), t4.indexOf(s2.default.compareVersions(n3, r3, i3)) > -1;
          }, t3.isOS = function(e4) {
            return this.getOSName(true) === String(e4).toLowerCase();
          }, t3.isPlatform = function(e4) {
            return this.getPlatformType(true) === String(e4).toLowerCase();
          }, t3.isEngine = function(e4) {
            return this.getEngineName(true) === String(e4).toLowerCase();
          }, t3.is = function(e4, t4) {
            return void 0 === t4 && (t4 = false), this.isBrowser(e4, t4) || this.isOS(e4) || this.isPlatform(e4);
          }, t3.some = function(e4) {
            var t4 = this;
            return void 0 === e4 && (e4 = []), e4.some((function(e5) {
              return t4.is(e5);
            }));
          }, e3;
        })();
        t2.default = d2, e2.exports = t2.default;
      }, 92: function(e2, t2, r2) {
        "use strict";
        t2.__esModule = true, t2.default = void 0;
        var i2, n2 = (i2 = r2(17)) && i2.__esModule ? i2 : { default: i2 };
        var a2 = /version\/(\d+(\.?_?\d+)+)/i, o2 = [{ test: [/gptbot/i], describe: function(e3) {
          var t3 = { name: "GPTBot" }, r3 = n2.default.getFirstMatch(/gptbot\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/chatgpt-user/i], describe: function(e3) {
          var t3 = { name: "ChatGPT-User" }, r3 = n2.default.getFirstMatch(/chatgpt-user\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/oai-searchbot/i], describe: function(e3) {
          var t3 = { name: "OAI-SearchBot" }, r3 = n2.default.getFirstMatch(/oai-searchbot\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/claudebot/i, /claude-web/i, /claude-user/i, /claude-searchbot/i], describe: function(e3) {
          var t3 = { name: "ClaudeBot" }, r3 = n2.default.getFirstMatch(/(?:claudebot|claude-web|claude-user|claude-searchbot)\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/omgilibot/i, /webzio-extended/i], describe: function(e3) {
          var t3 = { name: "Omgilibot" }, r3 = n2.default.getFirstMatch(/(?:omgilibot|webzio-extended)\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/diffbot/i], describe: function(e3) {
          var t3 = { name: "Diffbot" }, r3 = n2.default.getFirstMatch(/diffbot\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/perplexitybot/i], describe: function(e3) {
          var t3 = { name: "PerplexityBot" }, r3 = n2.default.getFirstMatch(/perplexitybot\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/perplexity-user/i], describe: function(e3) {
          var t3 = { name: "Perplexity-User" }, r3 = n2.default.getFirstMatch(/perplexity-user\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/youbot/i], describe: function(e3) {
          var t3 = { name: "YouBot" }, r3 = n2.default.getFirstMatch(/youbot\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/meta-webindexer/i], describe: function(e3) {
          var t3 = { name: "Meta-WebIndexer" }, r3 = n2.default.getFirstMatch(/meta-webindexer\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/meta-externalads/i], describe: function(e3) {
          var t3 = { name: "Meta-ExternalAds" }, r3 = n2.default.getFirstMatch(/meta-externalads\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/meta-externalagent/i], describe: function(e3) {
          var t3 = { name: "Meta-ExternalAgent" }, r3 = n2.default.getFirstMatch(/meta-externalagent\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/meta-externalfetcher/i], describe: function(e3) {
          var t3 = { name: "Meta-ExternalFetcher" }, r3 = n2.default.getFirstMatch(/meta-externalfetcher\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/googlebot/i], describe: function(e3) {
          var t3 = { name: "Googlebot" }, r3 = n2.default.getFirstMatch(/googlebot\/(\d+(\.\d+))/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/linespider/i], describe: function(e3) {
          var t3 = { name: "Linespider" }, r3 = n2.default.getFirstMatch(/(?:linespider)(?:-[-\w]+)?[\s/](\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/amazonbot/i], describe: function(e3) {
          var t3 = { name: "AmazonBot" }, r3 = n2.default.getFirstMatch(/amazonbot\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/bingbot/i], describe: function(e3) {
          var t3 = { name: "BingCrawler" }, r3 = n2.default.getFirstMatch(/bingbot\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/baiduspider/i], describe: function(e3) {
          var t3 = { name: "BaiduSpider" }, r3 = n2.default.getFirstMatch(/baiduspider\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/duckduckbot/i], describe: function(e3) {
          var t3 = { name: "DuckDuckBot" }, r3 = n2.default.getFirstMatch(/duckduckbot\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/ia_archiver/i], describe: function(e3) {
          var t3 = { name: "InternetArchiveCrawler" }, r3 = n2.default.getFirstMatch(/ia_archiver\/(\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/facebookexternalhit/i, /facebookcatalog/i], describe: function() {
          return { name: "FacebookExternalHit" };
        } }, { test: [/slackbot/i, /slack-imgProxy/i], describe: function(e3) {
          var t3 = { name: "SlackBot" }, r3 = n2.default.getFirstMatch(/(?:slackbot|slack-imgproxy)(?:-[-\w]+)?[\s/](\d+(\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/yahoo!?[\s/]*slurp/i], describe: function() {
          return { name: "YahooSlurp" };
        } }, { test: [/yandexbot/i, /yandexmobilebot/i], describe: function() {
          return { name: "YandexBot" };
        } }, { test: [/pingdom/i], describe: function() {
          return { name: "PingdomBot" };
        } }, { test: [/opera/i], describe: function(e3) {
          var t3 = { name: "Opera" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:opera)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/opr\/|opios/i], describe: function(e3) {
          var t3 = { name: "Opera" }, r3 = n2.default.getFirstMatch(/(?:opr|opios)[\s/](\S+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/SamsungBrowser/i], describe: function(e3) {
          var t3 = { name: "Samsung Internet for Android" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:SamsungBrowser)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/Whale/i], describe: function(e3) {
          var t3 = { name: "NAVER Whale Browser" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:whale)[\s/](\d+(?:\.\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/PaleMoon/i], describe: function(e3) {
          var t3 = { name: "Pale Moon" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:PaleMoon)[\s/](\d+(?:\.\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/MZBrowser/i], describe: function(e3) {
          var t3 = { name: "MZ Browser" }, r3 = n2.default.getFirstMatch(/(?:MZBrowser)[\s/](\d+(?:\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/focus/i], describe: function(e3) {
          var t3 = { name: "Focus" }, r3 = n2.default.getFirstMatch(/(?:focus)[\s/](\d+(?:\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/swing/i], describe: function(e3) {
          var t3 = { name: "Swing" }, r3 = n2.default.getFirstMatch(/(?:swing)[\s/](\d+(?:\.\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/coast/i], describe: function(e3) {
          var t3 = { name: "Opera Coast" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:coast)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/opt\/\d+(?:.?_?\d+)+/i], describe: function(e3) {
          var t3 = { name: "Opera Touch" }, r3 = n2.default.getFirstMatch(/(?:opt)[\s/](\d+(\.?_?\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/yabrowser/i], describe: function(e3) {
          var t3 = { name: "Yandex Browser" }, r3 = n2.default.getFirstMatch(/(?:yabrowser)[\s/](\d+(\.?_?\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/ucbrowser/i], describe: function(e3) {
          var t3 = { name: "UC Browser" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:ucbrowser)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/Maxthon|mxios/i], describe: function(e3) {
          var t3 = { name: "Maxthon" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:Maxthon|mxios)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/epiphany/i], describe: function(e3) {
          var t3 = { name: "Epiphany" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:epiphany)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/puffin/i], describe: function(e3) {
          var t3 = { name: "Puffin" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:puffin)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/sleipnir/i], describe: function(e3) {
          var t3 = { name: "Sleipnir" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:sleipnir)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/k-meleon/i], describe: function(e3) {
          var t3 = { name: "K-Meleon" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/(?:k-meleon)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/micromessenger/i], describe: function(e3) {
          var t3 = { name: "WeChat" }, r3 = n2.default.getFirstMatch(/(?:micromessenger)[\s/](\d+(\.?_?\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/qqbrowser/i], describe: function(e3) {
          var t3 = { name: /qqbrowserlite/i.test(e3) ? "QQ Browser Lite" : "QQ Browser" }, r3 = n2.default.getFirstMatch(/(?:qqbrowserlite|qqbrowser)[/](\d+(\.?_?\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/msie|trident/i], describe: function(e3) {
          var t3 = { name: "Internet Explorer" }, r3 = n2.default.getFirstMatch(/(?:msie |rv:)(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/\sedg\//i], describe: function(e3) {
          var t3 = { name: "Microsoft Edge" }, r3 = n2.default.getFirstMatch(/\sedg\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/edg([ea]|ios)/i], describe: function(e3) {
          var t3 = { name: "Microsoft Edge" }, r3 = n2.default.getSecondMatch(/edg([ea]|ios)\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/vivaldi/i], describe: function(e3) {
          var t3 = { name: "Vivaldi" }, r3 = n2.default.getFirstMatch(/vivaldi\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/seamonkey/i], describe: function(e3) {
          var t3 = { name: "SeaMonkey" }, r3 = n2.default.getFirstMatch(/seamonkey\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/sailfish/i], describe: function(e3) {
          var t3 = { name: "Sailfish" }, r3 = n2.default.getFirstMatch(/sailfish\s?browser\/(\d+(\.\d+)?)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/silk/i], describe: function(e3) {
          var t3 = { name: "Amazon Silk" }, r3 = n2.default.getFirstMatch(/silk\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/phantom/i], describe: function(e3) {
          var t3 = { name: "PhantomJS" }, r3 = n2.default.getFirstMatch(/phantomjs\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/slimerjs/i], describe: function(e3) {
          var t3 = { name: "SlimerJS" }, r3 = n2.default.getFirstMatch(/slimerjs\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/blackberry|\bbb\d+/i, /rim\stablet/i], describe: function(e3) {
          var t3 = { name: "BlackBerry" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/blackberry[\d]+\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/(web|hpw)[o0]s/i], describe: function(e3) {
          var t3 = { name: "WebOS Browser" }, r3 = n2.default.getFirstMatch(a2, e3) || n2.default.getFirstMatch(/w(?:eb)?[o0]sbrowser\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/bada/i], describe: function(e3) {
          var t3 = { name: "Bada" }, r3 = n2.default.getFirstMatch(/dolfin\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/tizen/i], describe: function(e3) {
          var t3 = { name: "Tizen" }, r3 = n2.default.getFirstMatch(/(?:tizen\s?)?browser\/(\d+(\.?_?\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/qupzilla/i], describe: function(e3) {
          var t3 = { name: "QupZilla" }, r3 = n2.default.getFirstMatch(/(?:qupzilla)[\s/](\d+(\.?_?\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/librewolf/i], describe: function(e3) {
          var t3 = { name: "LibreWolf" }, r3 = n2.default.getFirstMatch(/(?:librewolf)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/firefox|iceweasel|fxios/i], describe: function(e3) {
          var t3 = { name: "Firefox" }, r3 = n2.default.getFirstMatch(/(?:firefox|iceweasel|fxios)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/electron/i], describe: function(e3) {
          var t3 = { name: "Electron" }, r3 = n2.default.getFirstMatch(/(?:electron)\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/sogoumobilebrowser/i, /metasr/i, /se 2\.[x]/i], describe: function(e3) {
          var t3 = { name: "Sogou Browser" }, r3 = n2.default.getFirstMatch(/(?:sogoumobilebrowser)[\s/](\d+(\.?_?\d+)+)/i, e3), i3 = n2.default.getFirstMatch(/(?:chrome|crios|crmo)\/(\d+(\.?_?\d+)+)/i, e3), a3 = n2.default.getFirstMatch(/se ([\d.]+)x/i, e3), o3 = r3 || i3 || a3;
          return o3 && (t3.version = o3), t3;
        } }, { test: [/MiuiBrowser/i], describe: function(e3) {
          var t3 = { name: "Miui" }, r3 = n2.default.getFirstMatch(/(?:MiuiBrowser)[\s/](\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: function(e3) {
          return !!e3.hasBrand("DuckDuckGo") || e3.test(/\sDdg\/[\d.]+$/i);
        }, describe: function(e3, t3) {
          var r3 = { name: "DuckDuckGo" };
          if (t3) {
            var i3 = t3.getBrandVersion("DuckDuckGo");
            if (i3) return r3.version = i3, r3;
          }
          var a3 = n2.default.getFirstMatch(/\sDdg\/([\d.]+)$/i, e3);
          return a3 && (r3.version = a3), r3;
        } }, { test: function(e3) {
          return e3.hasBrand("Brave");
        }, describe: function(e3, t3) {
          var r3 = { name: "Brave" };
          if (t3) {
            var i3 = t3.getBrandVersion("Brave");
            if (i3) return r3.version = i3, r3;
          }
          return r3;
        } }, { test: [/chromium/i], describe: function(e3) {
          var t3 = { name: "Chromium" }, r3 = n2.default.getFirstMatch(/(?:chromium)[\s/](\d+(\.?_?\d+)+)/i, e3) || n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/chrome|crios|crmo/i], describe: function(e3) {
          var t3 = { name: "Chrome" }, r3 = n2.default.getFirstMatch(/(?:chrome|crios|crmo)\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/GSA/i], describe: function(e3) {
          var t3 = { name: "Google Search" }, r3 = n2.default.getFirstMatch(/(?:GSA)\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: function(e3) {
          var t3 = !e3.test(/like android/i), r3 = e3.test(/android/i);
          return t3 && r3;
        }, describe: function(e3) {
          var t3 = { name: "Android Browser" }, r3 = n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/playstation 4/i], describe: function(e3) {
          var t3 = { name: "PlayStation 4" }, r3 = n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/safari|applewebkit/i], describe: function(e3) {
          var t3 = { name: "Safari" }, r3 = n2.default.getFirstMatch(a2, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/.*/i], describe: function(e3) {
          var t3 = -1 !== e3.search("\\(") ? /^(.*)\/(.*)[ \t]\((.*)/ : /^(.*)\/(.*) /;
          return { name: n2.default.getFirstMatch(t3, e3), version: n2.default.getSecondMatch(t3, e3) };
        } }];
        t2.default = o2, e2.exports = t2.default;
      }, 93: function(e2, t2, r2) {
        "use strict";
        t2.__esModule = true, t2.default = void 0;
        var i2, n2 = (i2 = r2(17)) && i2.__esModule ? i2 : { default: i2 }, a2 = r2(18);
        var o2 = [{ test: [/Roku\/DVP/], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/Roku\/DVP-(\d+\.\d+)/i, e3);
          return { name: a2.OS_MAP.Roku, version: t3 };
        } }, { test: [/windows phone/i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/windows phone (?:os)?\s?(\d+(\.\d+)*)/i, e3);
          return { name: a2.OS_MAP.WindowsPhone, version: t3 };
        } }, { test: [/windows /i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/Windows ((NT|XP)( \d\d?.\d)?)/i, e3), r3 = n2.default.getWindowsVersionName(t3);
          return { name: a2.OS_MAP.Windows, version: t3, versionName: r3 };
        } }, { test: [/Macintosh(.*?) FxiOS(.*?)\//], describe: function(e3) {
          var t3 = { name: a2.OS_MAP.iOS }, r3 = n2.default.getSecondMatch(/(Version\/)(\d[\d.]+)/, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/macintosh/i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/mac os x (\d+(\.?_?\d+)+)/i, e3).replace(/[_\s]/g, "."), r3 = n2.default.getMacOSVersionName(t3), i3 = { name: a2.OS_MAP.MacOS, version: t3 };
          return r3 && (i3.versionName = r3), i3;
        } }, { test: [/(ipod|iphone|ipad)/i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/os (\d+([_\s]\d+)*) like mac os x/i, e3).replace(/[_\s]/g, ".");
          return { name: a2.OS_MAP.iOS, version: t3 };
        } }, { test: [/OpenHarmony/i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/OpenHarmony\s+(\d+(\.\d+)*)/i, e3);
          return { name: a2.OS_MAP.HarmonyOS, version: t3 };
        } }, { test: function(e3) {
          var t3 = !e3.test(/like android/i), r3 = e3.test(/android/i);
          return t3 && r3;
        }, describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/android[\s/-](\d+(\.\d+)*)/i, e3), r3 = n2.default.getAndroidVersionName(t3), i3 = { name: a2.OS_MAP.Android, version: t3 };
          return r3 && (i3.versionName = r3), i3;
        } }, { test: [/(web|hpw)[o0]s/i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/(?:web|hpw)[o0]s\/(\d+(\.\d+)*)/i, e3), r3 = { name: a2.OS_MAP.WebOS };
          return t3 && t3.length && (r3.version = t3), r3;
        } }, { test: [/blackberry|\bbb\d+/i, /rim\stablet/i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/rim\stablet\sos\s(\d+(\.\d+)*)/i, e3) || n2.default.getFirstMatch(/blackberry\d+\/(\d+([_\s]\d+)*)/i, e3) || n2.default.getFirstMatch(/\bbb(\d+)/i, e3);
          return { name: a2.OS_MAP.BlackBerry, version: t3 };
        } }, { test: [/bada/i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/bada\/(\d+(\.\d+)*)/i, e3);
          return { name: a2.OS_MAP.Bada, version: t3 };
        } }, { test: [/tizen/i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/tizen[/\s](\d+(\.\d+)*)/i, e3);
          return { name: a2.OS_MAP.Tizen, version: t3 };
        } }, { test: [/linux/i], describe: function() {
          return { name: a2.OS_MAP.Linux };
        } }, { test: [/CrOS/], describe: function() {
          return { name: a2.OS_MAP.ChromeOS };
        } }, { test: [/PlayStation 4/], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/PlayStation 4[/\s](\d+(\.\d+)*)/i, e3);
          return { name: a2.OS_MAP.PlayStation4, version: t3 };
        } }];
        t2.default = o2, e2.exports = t2.default;
      }, 94: function(e2, t2, r2) {
        "use strict";
        t2.__esModule = true, t2.default = void 0;
        var i2, n2 = (i2 = r2(17)) && i2.__esModule ? i2 : { default: i2 }, a2 = r2(18);
        var o2 = [{ test: [/googlebot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Google" };
        } }, { test: [/linespider/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Line" };
        } }, { test: [/amazonbot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Amazon" };
        } }, { test: [/gptbot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "OpenAI" };
        } }, { test: [/chatgpt-user/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "OpenAI" };
        } }, { test: [/oai-searchbot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "OpenAI" };
        } }, { test: [/baiduspider/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Baidu" };
        } }, { test: [/bingbot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Bing" };
        } }, { test: [/duckduckbot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "DuckDuckGo" };
        } }, { test: [/claudebot/i, /claude-web/i, /claude-user/i, /claude-searchbot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Anthropic" };
        } }, { test: [/omgilibot/i, /webzio-extended/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Webz.io" };
        } }, { test: [/diffbot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Diffbot" };
        } }, { test: [/perplexitybot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Perplexity AI" };
        } }, { test: [/perplexity-user/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Perplexity AI" };
        } }, { test: [/youbot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "You.com" };
        } }, { test: [/ia_archiver/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Internet Archive" };
        } }, { test: [/meta-webindexer/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Meta" };
        } }, { test: [/meta-externalads/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Meta" };
        } }, { test: [/meta-externalagent/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Meta" };
        } }, { test: [/meta-externalfetcher/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Meta" };
        } }, { test: [/facebookexternalhit/i, /facebookcatalog/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Meta" };
        } }, { test: [/slackbot/i, /slack-imgProxy/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Slack" };
        } }, { test: [/yahoo/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Yahoo" };
        } }, { test: [/yandexbot/i, /yandexmobilebot/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Yandex" };
        } }, { test: [/pingdom/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.bot, vendor: "Pingdom" };
        } }, { test: [/huawei/i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/(can-l01)/i, e3) && "Nova", r3 = { type: a2.PLATFORMS_MAP.mobile, vendor: "Huawei" };
          return t3 && (r3.model = t3), r3;
        } }, { test: [/nexus\s*(?:7|8|9|10).*/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.tablet, vendor: "Nexus" };
        } }, { test: [/ipad/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.tablet, vendor: "Apple", model: "iPad" };
        } }, { test: [/Macintosh(.*?) FxiOS(.*?)\//], describe: function() {
          return { type: a2.PLATFORMS_MAP.tablet, vendor: "Apple", model: "iPad" };
        } }, { test: [/kftt build/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.tablet, vendor: "Amazon", model: "Kindle Fire HD 7" };
        } }, { test: [/silk/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.tablet, vendor: "Amazon" };
        } }, { test: [/tablet(?! pc)/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.tablet };
        } }, { test: function(e3) {
          var t3 = e3.test(/ipod|iphone/i), r3 = e3.test(/like (ipod|iphone)/i);
          return t3 && !r3;
        }, describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/(ipod|iphone)/i, e3);
          return { type: a2.PLATFORMS_MAP.mobile, vendor: "Apple", model: t3 };
        } }, { test: [/nexus\s*[0-6].*/i, /galaxy nexus/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.mobile, vendor: "Nexus" };
        } }, { test: [/Nokia/i], describe: function(e3) {
          var t3 = n2.default.getFirstMatch(/Nokia\s+([0-9]+(\.[0-9]+)?)/i, e3), r3 = { type: a2.PLATFORMS_MAP.mobile, vendor: "Nokia" };
          return t3 && (r3.model = t3), r3;
        } }, { test: [/[^-]mobi/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.mobile };
        } }, { test: function(e3) {
          return "blackberry" === e3.getBrowserName(true);
        }, describe: function() {
          return { type: a2.PLATFORMS_MAP.mobile, vendor: "BlackBerry" };
        } }, { test: function(e3) {
          return "bada" === e3.getBrowserName(true);
        }, describe: function() {
          return { type: a2.PLATFORMS_MAP.mobile };
        } }, { test: function(e3) {
          return "windows phone" === e3.getBrowserName();
        }, describe: function() {
          return { type: a2.PLATFORMS_MAP.mobile, vendor: "Microsoft" };
        } }, { test: function(e3) {
          var t3 = Number(String(e3.getOSVersion()).split(".")[0]);
          return "android" === e3.getOSName(true) && t3 >= 3;
        }, describe: function() {
          return { type: a2.PLATFORMS_MAP.tablet };
        } }, { test: function(e3) {
          return "android" === e3.getOSName(true);
        }, describe: function() {
          return { type: a2.PLATFORMS_MAP.mobile };
        } }, { test: [/smart-?tv|smarttv/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.tv };
        } }, { test: [/netcast/i], describe: function() {
          return { type: a2.PLATFORMS_MAP.tv };
        } }, { test: function(e3) {
          return "macos" === e3.getOSName(true);
        }, describe: function() {
          return { type: a2.PLATFORMS_MAP.desktop, vendor: "Apple" };
        } }, { test: function(e3) {
          return "windows" === e3.getOSName(true);
        }, describe: function() {
          return { type: a2.PLATFORMS_MAP.desktop };
        } }, { test: function(e3) {
          return "linux" === e3.getOSName(true);
        }, describe: function() {
          return { type: a2.PLATFORMS_MAP.desktop };
        } }, { test: function(e3) {
          return "playstation 4" === e3.getOSName(true);
        }, describe: function() {
          return { type: a2.PLATFORMS_MAP.tv };
        } }, { test: function(e3) {
          return "roku" === e3.getOSName(true);
        }, describe: function() {
          return { type: a2.PLATFORMS_MAP.tv };
        } }];
        t2.default = o2, e2.exports = t2.default;
      }, 95: function(e2, t2, r2) {
        "use strict";
        t2.__esModule = true, t2.default = void 0;
        var i2, n2 = (i2 = r2(17)) && i2.__esModule ? i2 : { default: i2 }, a2 = r2(18);
        var o2 = [{ test: function(e3) {
          return "microsoft edge" === e3.getBrowserName(true);
        }, describe: function(e3) {
          if (/\sedg\//i.test(e3)) return { name: a2.ENGINE_MAP.Blink };
          var t3 = n2.default.getFirstMatch(/edge\/(\d+(\.?_?\d+)+)/i, e3);
          return { name: a2.ENGINE_MAP.EdgeHTML, version: t3 };
        } }, { test: [/trident/i], describe: function(e3) {
          var t3 = { name: a2.ENGINE_MAP.Trident }, r3 = n2.default.getFirstMatch(/trident\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: function(e3) {
          return e3.test(/presto/i);
        }, describe: function(e3) {
          var t3 = { name: a2.ENGINE_MAP.Presto }, r3 = n2.default.getFirstMatch(/presto\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: function(e3) {
          var t3 = e3.test(/gecko/i), r3 = e3.test(/like gecko/i);
          return t3 && !r3;
        }, describe: function(e3) {
          var t3 = { name: a2.ENGINE_MAP.Gecko }, r3 = n2.default.getFirstMatch(/gecko\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }, { test: [/(apple)?webkit\/537\.36/i], describe: function() {
          return { name: a2.ENGINE_MAP.Blink };
        } }, { test: [/(apple)?webkit/i], describe: function(e3) {
          var t3 = { name: a2.ENGINE_MAP.WebKit }, r3 = n2.default.getFirstMatch(/webkit\/(\d+(\.?_?\d+)+)/i, e3);
          return r3 && (t3.version = r3), t3;
        } }];
        t2.default = o2, e2.exports = t2.default;
      } });
    }));
  }
});

// node_modules/@aws-crypto/crc32/node_modules/tslib/tslib.es6.js
var tslib_es6_exports6 = {};
__export(tslib_es6_exports6, {
  __assign: () => __assign6,
  __asyncDelegator: () => __asyncDelegator6,
  __asyncGenerator: () => __asyncGenerator6,
  __asyncValues: () => __asyncValues6,
  __await: () => __await6,
  __awaiter: () => __awaiter6,
  __classPrivateFieldGet: () => __classPrivateFieldGet6,
  __classPrivateFieldSet: () => __classPrivateFieldSet6,
  __createBinding: () => __createBinding6,
  __decorate: () => __decorate6,
  __exportStar: () => __exportStar6,
  __extends: () => __extends6,
  __generator: () => __generator6,
  __importDefault: () => __importDefault6,
  __importStar: () => __importStar6,
  __makeTemplateObject: () => __makeTemplateObject6,
  __metadata: () => __metadata6,
  __param: () => __param6,
  __read: () => __read6,
  __rest: () => __rest6,
  __spread: () => __spread6,
  __spreadArrays: () => __spreadArrays6,
  __values: () => __values6
});
function __extends6(d2, b2) {
  extendStatics6(d2, b2);
  function __() {
    this.constructor = d2;
  }
  d2.prototype = b2 === null ? Object.create(b2) : (__.prototype = b2.prototype, new __());
}
function __rest6(s2, e2) {
  var t2 = {};
  for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2) && e2.indexOf(p2) < 0)
    t2[p2] = s2[p2];
  if (s2 != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i2 = 0, p2 = Object.getOwnPropertySymbols(s2); i2 < p2.length; i2++) {
      if (e2.indexOf(p2[i2]) < 0 && Object.prototype.propertyIsEnumerable.call(s2, p2[i2]))
        t2[p2[i2]] = s2[p2[i2]];
    }
  return t2;
}
function __decorate6(decorators, target, key, desc) {
  var c2 = arguments.length, r2 = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d2;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r2 = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d2 = decorators[i2]) r2 = (c2 < 3 ? d2(r2) : c2 > 3 ? d2(target, key, r2) : d2(target, key)) || r2;
  return c2 > 3 && r2 && Object.defineProperty(target, key, r2), r2;
}
function __param6(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __metadata6(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter6(thisArg, _arguments, P2, generator) {
  function adopt(value) {
    return value instanceof P2 ? value : new P2(function(resolve) {
      resolve(value);
    });
  }
  return new (P2 || (P2 = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e2) {
        reject(e2);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e2) {
        reject(e2);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator6(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t2[0] & 1) throw t2[1];
    return t2[1];
  }, trys: [], ops: [] }, f2, y2, t2, g2;
  return g2 = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g2[Symbol.iterator] = function() {
    return this;
  }), g2;
  function verb(n2) {
    return function(v2) {
      return step([n2, v2]);
    };
  }
  function step(op) {
    if (f2) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f2 = 1, y2 && (t2 = op[0] & 2 ? y2["return"] : op[0] ? y2["throw"] || ((t2 = y2["return"]) && t2.call(y2), 0) : y2.next) && !(t2 = t2.call(y2, op[1])).done) return t2;
      if (y2 = 0, t2) op = [op[0] & 2, t2.value];
      switch (op[0]) {
        case 0:
        case 1:
          t2 = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y2 = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t2 = _.trys, t2 = t2.length > 0 && t2[t2.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t2 || op[1] > t2[0] && op[1] < t2[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t2[1]) {
            _.label = t2[1];
            t2 = op;
            break;
          }
          if (t2 && _.label < t2[2]) {
            _.label = t2[2];
            _.ops.push(op);
            break;
          }
          if (t2[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e2) {
      op = [6, e2];
      y2 = 0;
    } finally {
      f2 = t2 = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __createBinding6(o2, m2, k2, k22) {
  if (k22 === void 0) k22 = k2;
  o2[k22] = m2[k2];
}
function __exportStar6(m2, exports) {
  for (var p2 in m2) if (p2 !== "default" && !exports.hasOwnProperty(p2)) exports[p2] = m2[p2];
}
function __values6(o2) {
  var s2 = typeof Symbol === "function" && Symbol.iterator, m2 = s2 && o2[s2], i2 = 0;
  if (m2) return m2.call(o2);
  if (o2 && typeof o2.length === "number") return {
    next: function() {
      if (o2 && i2 >= o2.length) o2 = void 0;
      return { value: o2 && o2[i2++], done: !o2 };
    }
  };
  throw new TypeError(s2 ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read6(o2, n2) {
  var m2 = typeof Symbol === "function" && o2[Symbol.iterator];
  if (!m2) return o2;
  var i2 = m2.call(o2), r2, ar2 = [], e2;
  try {
    while ((n2 === void 0 || n2-- > 0) && !(r2 = i2.next()).done) ar2.push(r2.value);
  } catch (error) {
    e2 = { error };
  } finally {
    try {
      if (r2 && !r2.done && (m2 = i2["return"])) m2.call(i2);
    } finally {
      if (e2) throw e2.error;
    }
  }
  return ar2;
}
function __spread6() {
  for (var ar2 = [], i2 = 0; i2 < arguments.length; i2++)
    ar2 = ar2.concat(__read6(arguments[i2]));
  return ar2;
}
function __spreadArrays6() {
  for (var s2 = 0, i2 = 0, il = arguments.length; i2 < il; i2++) s2 += arguments[i2].length;
  for (var r2 = Array(s2), k2 = 0, i2 = 0; i2 < il; i2++)
    for (var a2 = arguments[i2], j2 = 0, jl = a2.length; j2 < jl; j2++, k2++)
      r2[k2] = a2[j2];
  return r2;
}
function __await6(v2) {
  return this instanceof __await6 ? (this.v = v2, this) : new __await6(v2);
}
function __asyncGenerator6(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g2 = generator.apply(thisArg, _arguments || []), i2, q2 = [];
  return i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2;
  function verb(n2) {
    if (g2[n2]) i2[n2] = function(v2) {
      return new Promise(function(a2, b2) {
        q2.push([n2, v2, a2, b2]) > 1 || resume(n2, v2);
      });
    };
  }
  function resume(n2, v2) {
    try {
      step(g2[n2](v2));
    } catch (e2) {
      settle(q2[0][3], e2);
    }
  }
  function step(r2) {
    r2.value instanceof __await6 ? Promise.resolve(r2.value.v).then(fulfill, reject) : settle(q2[0][2], r2);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f2, v2) {
    if (f2(v2), q2.shift(), q2.length) resume(q2[0][0], q2[0][1]);
  }
}
function __asyncDelegator6(o2) {
  var i2, p2;
  return i2 = {}, verb("next"), verb("throw", function(e2) {
    throw e2;
  }), verb("return"), i2[Symbol.iterator] = function() {
    return this;
  }, i2;
  function verb(n2, f2) {
    i2[n2] = o2[n2] ? function(v2) {
      return (p2 = !p2) ? { value: __await6(o2[n2](v2)), done: n2 === "return" } : f2 ? f2(v2) : v2;
    } : f2;
  }
}
function __asyncValues6(o2) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m2 = o2[Symbol.asyncIterator], i2;
  return m2 ? m2.call(o2) : (o2 = typeof __values6 === "function" ? __values6(o2) : o2[Symbol.iterator](), i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2);
  function verb(n2) {
    i2[n2] = o2[n2] && function(v2) {
      return new Promise(function(resolve, reject) {
        v2 = o2[n2](v2), settle(resolve, reject, v2.done, v2.value);
      });
    };
  }
  function settle(resolve, reject, d2, v2) {
    Promise.resolve(v2).then(function(v3) {
      resolve({ value: v3, done: d2 });
    }, reject);
  }
}
function __makeTemplateObject6(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar6(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k2 in mod) if (Object.hasOwnProperty.call(mod, k2)) result[k2] = mod[k2];
  }
  result.default = mod;
  return result;
}
function __importDefault6(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet6(receiver, privateMap) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to get private field on non-instance");
  }
  return privateMap.get(receiver);
}
function __classPrivateFieldSet6(receiver, privateMap, value) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to set private field on non-instance");
  }
  privateMap.set(receiver, value);
  return value;
}
var extendStatics6, __assign6;
var init_tslib_es66 = __esm({
  "node_modules/@aws-crypto/crc32/node_modules/tslib/tslib.es6.js"() {
    extendStatics6 = function(d2, b2) {
      extendStatics6 = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d3, b3) {
        d3.__proto__ = b3;
      } || function(d3, b3) {
        for (var p2 in b3) if (b3.hasOwnProperty(p2)) d3[p2] = b3[p2];
      };
      return extendStatics6(d2, b2);
    };
    __assign6 = function() {
      __assign6 = Object.assign || function __assign8(t2) {
        for (var s2, i2 = 1, n2 = arguments.length; i2 < n2; i2++) {
          s2 = arguments[i2];
          for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2)) t2[p2] = s2[p2];
        }
        return t2;
      };
      return __assign6.apply(this, arguments);
    };
  }
});

// node_modules/@aws-crypto/crc32/build/aws_crc32.js
var require_aws_crc32 = __commonJS({
  "node_modules/@aws-crypto/crc32/build/aws_crc32.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AwsCrc32 = void 0;
    var tslib_1 = (init_tslib_es66(), __toCommonJS(tslib_es6_exports6));
    var util_1 = require_build3();
    var index_1 = require_build7();
    var AwsCrc322 = (
      /** @class */
      (function() {
        function AwsCrc323() {
          this.crc32 = new index_1.Crc32();
        }
        AwsCrc323.prototype.update = function(toHash) {
          if ((0, util_1.isEmptyData)(toHash))
            return;
          this.crc32.update((0, util_1.convertToBuffer)(toHash));
        };
        AwsCrc323.prototype.digest = function() {
          return tslib_1.__awaiter(this, void 0, void 0, function() {
            return tslib_1.__generator(this, function(_a) {
              return [2, (0, util_1.numToUint8)(this.crc32.digest())];
            });
          });
        };
        AwsCrc323.prototype.reset = function() {
          this.crc32 = new index_1.Crc32();
        };
        return AwsCrc323;
      })()
    );
    exports.AwsCrc32 = AwsCrc322;
  }
});

// node_modules/@aws-crypto/crc32/build/index.js
var require_build7 = __commonJS({
  "node_modules/@aws-crypto/crc32/build/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AwsCrc32 = exports.Crc32 = exports.crc32 = void 0;
    var tslib_1 = (init_tslib_es66(), __toCommonJS(tslib_es6_exports6));
    var util_1 = require_build3();
    function crc32(data) {
      return new Crc323().update(data).digest();
    }
    exports.crc32 = crc32;
    var Crc323 = (
      /** @class */
      (function() {
        function Crc324() {
          this.checksum = 4294967295;
        }
        Crc324.prototype.update = function(data) {
          var e_1, _a;
          try {
            for (var data_1 = tslib_1.__values(data), data_1_1 = data_1.next(); !data_1_1.done; data_1_1 = data_1.next()) {
              var byte = data_1_1.value;
              this.checksum = this.checksum >>> 8 ^ lookupTable[(this.checksum ^ byte) & 255];
            }
          } catch (e_1_1) {
            e_1 = { error: e_1_1 };
          } finally {
            try {
              if (data_1_1 && !data_1_1.done && (_a = data_1.return)) _a.call(data_1);
            } finally {
              if (e_1) throw e_1.error;
            }
          }
          return this;
        };
        Crc324.prototype.digest = function() {
          return (this.checksum ^ 4294967295) >>> 0;
        };
        return Crc324;
      })()
    );
    exports.Crc32 = Crc323;
    var a_lookUpTable = [
      0,
      1996959894,
      3993919788,
      2567524794,
      124634137,
      1886057615,
      3915621685,
      2657392035,
      249268274,
      2044508324,
      3772115230,
      2547177864,
      162941995,
      2125561021,
      3887607047,
      2428444049,
      498536548,
      1789927666,
      4089016648,
      2227061214,
      450548861,
      1843258603,
      4107580753,
      2211677639,
      325883990,
      1684777152,
      4251122042,
      2321926636,
      335633487,
      1661365465,
      4195302755,
      2366115317,
      997073096,
      1281953886,
      3579855332,
      2724688242,
      1006888145,
      1258607687,
      3524101629,
      2768942443,
      901097722,
      1119000684,
      3686517206,
      2898065728,
      853044451,
      1172266101,
      3705015759,
      2882616665,
      651767980,
      1373503546,
      3369554304,
      3218104598,
      565507253,
      1454621731,
      3485111705,
      3099436303,
      671266974,
      1594198024,
      3322730930,
      2970347812,
      795835527,
      1483230225,
      3244367275,
      3060149565,
      1994146192,
      31158534,
      2563907772,
      4023717930,
      1907459465,
      112637215,
      2680153253,
      3904427059,
      2013776290,
      251722036,
      2517215374,
      3775830040,
      2137656763,
      141376813,
      2439277719,
      3865271297,
      1802195444,
      476864866,
      2238001368,
      4066508878,
      1812370925,
      453092731,
      2181625025,
      4111451223,
      1706088902,
      314042704,
      2344532202,
      4240017532,
      1658658271,
      366619977,
      2362670323,
      4224994405,
      1303535960,
      984961486,
      2747007092,
      3569037538,
      1256170817,
      1037604311,
      2765210733,
      3554079995,
      1131014506,
      879679996,
      2909243462,
      3663771856,
      1141124467,
      855842277,
      2852801631,
      3708648649,
      1342533948,
      654459306,
      3188396048,
      3373015174,
      1466479909,
      544179635,
      3110523913,
      3462522015,
      1591671054,
      702138776,
      2966460450,
      3352799412,
      1504918807,
      783551873,
      3082640443,
      3233442989,
      3988292384,
      2596254646,
      62317068,
      1957810842,
      3939845945,
      2647816111,
      81470997,
      1943803523,
      3814918930,
      2489596804,
      225274430,
      2053790376,
      3826175755,
      2466906013,
      167816743,
      2097651377,
      4027552580,
      2265490386,
      503444072,
      1762050814,
      4150417245,
      2154129355,
      426522225,
      1852507879,
      4275313526,
      2312317920,
      282753626,
      1742555852,
      4189708143,
      2394877945,
      397917763,
      1622183637,
      3604390888,
      2714866558,
      953729732,
      1340076626,
      3518719985,
      2797360999,
      1068828381,
      1219638859,
      3624741850,
      2936675148,
      906185462,
      1090812512,
      3747672003,
      2825379669,
      829329135,
      1181335161,
      3412177804,
      3160834842,
      628085408,
      1382605366,
      3423369109,
      3138078467,
      570562233,
      1426400815,
      3317316542,
      2998733608,
      733239954,
      1555261956,
      3268935591,
      3050360625,
      752459403,
      1541320221,
      2607071920,
      3965973030,
      1969922972,
      40735498,
      2617837225,
      3943577151,
      1913087877,
      83908371,
      2512341634,
      3803740692,
      2075208622,
      213261112,
      2463272603,
      3855990285,
      2094854071,
      198958881,
      2262029012,
      4057260610,
      1759359992,
      534414190,
      2176718541,
      4139329115,
      1873836001,
      414664567,
      2282248934,
      4279200368,
      1711684554,
      285281116,
      2405801727,
      4167216745,
      1634467795,
      376229701,
      2685067896,
      3608007406,
      1308918612,
      956543938,
      2808555105,
      3495958263,
      1231636301,
      1047427035,
      2932959818,
      3654703836,
      1088359270,
      936918e3,
      2847714899,
      3736837829,
      1202900863,
      817233897,
      3183342108,
      3401237130,
      1404277552,
      615818150,
      3134207493,
      3453421203,
      1423857449,
      601450431,
      3009837614,
      3294710456,
      1567103746,
      711928724,
      3020668471,
      3272380065,
      1510334235,
      755167117
    ];
    var lookupTable = (0, util_1.uint32ArrayFrom)(a_lookUpTable);
    var aws_crc32_1 = require_aws_crc32();
    Object.defineProperty(exports, "AwsCrc32", { enumerable: true, get: function() {
      return aws_crc32_1.AwsCrc32;
    } });
  }
});

// node_modules/@aws-crypto/crc32c/node_modules/tslib/tslib.es6.js
var tslib_es6_exports7 = {};
__export(tslib_es6_exports7, {
  __assign: () => __assign7,
  __asyncDelegator: () => __asyncDelegator7,
  __asyncGenerator: () => __asyncGenerator7,
  __asyncValues: () => __asyncValues7,
  __await: () => __await7,
  __awaiter: () => __awaiter7,
  __classPrivateFieldGet: () => __classPrivateFieldGet7,
  __classPrivateFieldSet: () => __classPrivateFieldSet7,
  __createBinding: () => __createBinding7,
  __decorate: () => __decorate7,
  __exportStar: () => __exportStar7,
  __extends: () => __extends7,
  __generator: () => __generator7,
  __importDefault: () => __importDefault7,
  __importStar: () => __importStar7,
  __makeTemplateObject: () => __makeTemplateObject7,
  __metadata: () => __metadata7,
  __param: () => __param7,
  __read: () => __read7,
  __rest: () => __rest7,
  __spread: () => __spread7,
  __spreadArrays: () => __spreadArrays7,
  __values: () => __values7
});
function __extends7(d2, b2) {
  extendStatics7(d2, b2);
  function __() {
    this.constructor = d2;
  }
  d2.prototype = b2 === null ? Object.create(b2) : (__.prototype = b2.prototype, new __());
}
function __rest7(s2, e2) {
  var t2 = {};
  for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2) && e2.indexOf(p2) < 0)
    t2[p2] = s2[p2];
  if (s2 != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i2 = 0, p2 = Object.getOwnPropertySymbols(s2); i2 < p2.length; i2++) {
      if (e2.indexOf(p2[i2]) < 0 && Object.prototype.propertyIsEnumerable.call(s2, p2[i2]))
        t2[p2[i2]] = s2[p2[i2]];
    }
  return t2;
}
function __decorate7(decorators, target, key, desc) {
  var c2 = arguments.length, r2 = c2 < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d2;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r2 = Reflect.decorate(decorators, target, key, desc);
  else for (var i2 = decorators.length - 1; i2 >= 0; i2--) if (d2 = decorators[i2]) r2 = (c2 < 3 ? d2(r2) : c2 > 3 ? d2(target, key, r2) : d2(target, key)) || r2;
  return c2 > 3 && r2 && Object.defineProperty(target, key, r2), r2;
}
function __param7(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __metadata7(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter7(thisArg, _arguments, P2, generator) {
  function adopt(value) {
    return value instanceof P2 ? value : new P2(function(resolve) {
      resolve(value);
    });
  }
  return new (P2 || (P2 = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e2) {
        reject(e2);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e2) {
        reject(e2);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator7(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t2[0] & 1) throw t2[1];
    return t2[1];
  }, trys: [], ops: [] }, f2, y2, t2, g2;
  return g2 = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g2[Symbol.iterator] = function() {
    return this;
  }), g2;
  function verb(n2) {
    return function(v2) {
      return step([n2, v2]);
    };
  }
  function step(op) {
    if (f2) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f2 = 1, y2 && (t2 = op[0] & 2 ? y2["return"] : op[0] ? y2["throw"] || ((t2 = y2["return"]) && t2.call(y2), 0) : y2.next) && !(t2 = t2.call(y2, op[1])).done) return t2;
      if (y2 = 0, t2) op = [op[0] & 2, t2.value];
      switch (op[0]) {
        case 0:
        case 1:
          t2 = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y2 = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t2 = _.trys, t2 = t2.length > 0 && t2[t2.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t2 || op[1] > t2[0] && op[1] < t2[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t2[1]) {
            _.label = t2[1];
            t2 = op;
            break;
          }
          if (t2 && _.label < t2[2]) {
            _.label = t2[2];
            _.ops.push(op);
            break;
          }
          if (t2[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e2) {
      op = [6, e2];
      y2 = 0;
    } finally {
      f2 = t2 = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __createBinding7(o2, m2, k2, k22) {
  if (k22 === void 0) k22 = k2;
  o2[k22] = m2[k2];
}
function __exportStar7(m2, exports) {
  for (var p2 in m2) if (p2 !== "default" && !exports.hasOwnProperty(p2)) exports[p2] = m2[p2];
}
function __values7(o2) {
  var s2 = typeof Symbol === "function" && Symbol.iterator, m2 = s2 && o2[s2], i2 = 0;
  if (m2) return m2.call(o2);
  if (o2 && typeof o2.length === "number") return {
    next: function() {
      if (o2 && i2 >= o2.length) o2 = void 0;
      return { value: o2 && o2[i2++], done: !o2 };
    }
  };
  throw new TypeError(s2 ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read7(o2, n2) {
  var m2 = typeof Symbol === "function" && o2[Symbol.iterator];
  if (!m2) return o2;
  var i2 = m2.call(o2), r2, ar2 = [], e2;
  try {
    while ((n2 === void 0 || n2-- > 0) && !(r2 = i2.next()).done) ar2.push(r2.value);
  } catch (error) {
    e2 = { error };
  } finally {
    try {
      if (r2 && !r2.done && (m2 = i2["return"])) m2.call(i2);
    } finally {
      if (e2) throw e2.error;
    }
  }
  return ar2;
}
function __spread7() {
  for (var ar2 = [], i2 = 0; i2 < arguments.length; i2++)
    ar2 = ar2.concat(__read7(arguments[i2]));
  return ar2;
}
function __spreadArrays7() {
  for (var s2 = 0, i2 = 0, il = arguments.length; i2 < il; i2++) s2 += arguments[i2].length;
  for (var r2 = Array(s2), k2 = 0, i2 = 0; i2 < il; i2++)
    for (var a2 = arguments[i2], j2 = 0, jl = a2.length; j2 < jl; j2++, k2++)
      r2[k2] = a2[j2];
  return r2;
}
function __await7(v2) {
  return this instanceof __await7 ? (this.v = v2, this) : new __await7(v2);
}
function __asyncGenerator7(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g2 = generator.apply(thisArg, _arguments || []), i2, q2 = [];
  return i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2;
  function verb(n2) {
    if (g2[n2]) i2[n2] = function(v2) {
      return new Promise(function(a2, b2) {
        q2.push([n2, v2, a2, b2]) > 1 || resume(n2, v2);
      });
    };
  }
  function resume(n2, v2) {
    try {
      step(g2[n2](v2));
    } catch (e2) {
      settle(q2[0][3], e2);
    }
  }
  function step(r2) {
    r2.value instanceof __await7 ? Promise.resolve(r2.value.v).then(fulfill, reject) : settle(q2[0][2], r2);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f2, v2) {
    if (f2(v2), q2.shift(), q2.length) resume(q2[0][0], q2[0][1]);
  }
}
function __asyncDelegator7(o2) {
  var i2, p2;
  return i2 = {}, verb("next"), verb("throw", function(e2) {
    throw e2;
  }), verb("return"), i2[Symbol.iterator] = function() {
    return this;
  }, i2;
  function verb(n2, f2) {
    i2[n2] = o2[n2] ? function(v2) {
      return (p2 = !p2) ? { value: __await7(o2[n2](v2)), done: n2 === "return" } : f2 ? f2(v2) : v2;
    } : f2;
  }
}
function __asyncValues7(o2) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m2 = o2[Symbol.asyncIterator], i2;
  return m2 ? m2.call(o2) : (o2 = typeof __values7 === "function" ? __values7(o2) : o2[Symbol.iterator](), i2 = {}, verb("next"), verb("throw"), verb("return"), i2[Symbol.asyncIterator] = function() {
    return this;
  }, i2);
  function verb(n2) {
    i2[n2] = o2[n2] && function(v2) {
      return new Promise(function(resolve, reject) {
        v2 = o2[n2](v2), settle(resolve, reject, v2.done, v2.value);
      });
    };
  }
  function settle(resolve, reject, d2, v2) {
    Promise.resolve(v2).then(function(v3) {
      resolve({ value: v3, done: d2 });
    }, reject);
  }
}
function __makeTemplateObject7(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar7(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k2 in mod) if (Object.hasOwnProperty.call(mod, k2)) result[k2] = mod[k2];
  }
  result.default = mod;
  return result;
}
function __importDefault7(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
function __classPrivateFieldGet7(receiver, privateMap) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to get private field on non-instance");
  }
  return privateMap.get(receiver);
}
function __classPrivateFieldSet7(receiver, privateMap, value) {
  if (!privateMap.has(receiver)) {
    throw new TypeError("attempted to set private field on non-instance");
  }
  privateMap.set(receiver, value);
  return value;
}
var extendStatics7, __assign7;
var init_tslib_es67 = __esm({
  "node_modules/@aws-crypto/crc32c/node_modules/tslib/tslib.es6.js"() {
    extendStatics7 = function(d2, b2) {
      extendStatics7 = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d3, b3) {
        d3.__proto__ = b3;
      } || function(d3, b3) {
        for (var p2 in b3) if (b3.hasOwnProperty(p2)) d3[p2] = b3[p2];
      };
      return extendStatics7(d2, b2);
    };
    __assign7 = function() {
      __assign7 = Object.assign || function __assign8(t2) {
        for (var s2, i2 = 1, n2 = arguments.length; i2 < n2; i2++) {
          s2 = arguments[i2];
          for (var p2 in s2) if (Object.prototype.hasOwnProperty.call(s2, p2)) t2[p2] = s2[p2];
        }
        return t2;
      };
      return __assign7.apply(this, arguments);
    };
  }
});

// node_modules/@aws-crypto/crc32c/build/aws_crc32c.js
var require_aws_crc32c = __commonJS({
  "node_modules/@aws-crypto/crc32c/build/aws_crc32c.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AwsCrc32c = void 0;
    var tslib_1 = (init_tslib_es67(), __toCommonJS(tslib_es6_exports7));
    var util_1 = require_build3();
    var index_1 = require_build8();
    var AwsCrc32c2 = (
      /** @class */
      (function() {
        function AwsCrc32c3() {
          this.crc32c = new index_1.Crc32c();
        }
        AwsCrc32c3.prototype.update = function(toHash) {
          if ((0, util_1.isEmptyData)(toHash))
            return;
          this.crc32c.update((0, util_1.convertToBuffer)(toHash));
        };
        AwsCrc32c3.prototype.digest = function() {
          return tslib_1.__awaiter(this, void 0, void 0, function() {
            return tslib_1.__generator(this, function(_a) {
              return [2, (0, util_1.numToUint8)(this.crc32c.digest())];
            });
          });
        };
        AwsCrc32c3.prototype.reset = function() {
          this.crc32c = new index_1.Crc32c();
        };
        return AwsCrc32c3;
      })()
    );
    exports.AwsCrc32c = AwsCrc32c2;
  }
});

// node_modules/@aws-crypto/crc32c/build/index.js
var require_build8 = __commonJS({
  "node_modules/@aws-crypto/crc32c/build/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AwsCrc32c = exports.Crc32c = exports.crc32c = void 0;
    var tslib_1 = (init_tslib_es67(), __toCommonJS(tslib_es6_exports7));
    var util_1 = require_build3();
    function crc32c(data) {
      return new Crc32c().update(data).digest();
    }
    exports.crc32c = crc32c;
    var Crc32c = (
      /** @class */
      (function() {
        function Crc32c2() {
          this.checksum = 4294967295;
        }
        Crc32c2.prototype.update = function(data) {
          var e_1, _a;
          try {
            for (var data_1 = tslib_1.__values(data), data_1_1 = data_1.next(); !data_1_1.done; data_1_1 = data_1.next()) {
              var byte = data_1_1.value;
              this.checksum = this.checksum >>> 8 ^ lookupTable[(this.checksum ^ byte) & 255];
            }
          } catch (e_1_1) {
            e_1 = { error: e_1_1 };
          } finally {
            try {
              if (data_1_1 && !data_1_1.done && (_a = data_1.return)) _a.call(data_1);
            } finally {
              if (e_1) throw e_1.error;
            }
          }
          return this;
        };
        Crc32c2.prototype.digest = function() {
          return (this.checksum ^ 4294967295) >>> 0;
        };
        return Crc32c2;
      })()
    );
    exports.Crc32c = Crc32c;
    var a_lookupTable = [
      0,
      4067132163,
      3778769143,
      324072436,
      3348797215,
      904991772,
      648144872,
      3570033899,
      2329499855,
      2024987596,
      1809983544,
      2575936315,
      1296289744,
      3207089363,
      2893594407,
      1578318884,
      274646895,
      3795141740,
      4049975192,
      51262619,
      3619967088,
      632279923,
      922689671,
      3298075524,
      2592579488,
      1760304291,
      2075979607,
      2312596564,
      1562183871,
      2943781820,
      3156637768,
      1313733451,
      549293790,
      3537243613,
      3246849577,
      871202090,
      3878099393,
      357341890,
      102525238,
      4101499445,
      2858735121,
      1477399826,
      1264559846,
      3107202533,
      1845379342,
      2677391885,
      2361733625,
      2125378298,
      820201905,
      3263744690,
      3520608582,
      598981189,
      4151959214,
      85089709,
      373468761,
      3827903834,
      3124367742,
      1213305469,
      1526817161,
      2842354314,
      2107672161,
      2412447074,
      2627466902,
      1861252501,
      1098587580,
      3004210879,
      2688576843,
      1378610760,
      2262928035,
      1955203488,
      1742404180,
      2511436119,
      3416409459,
      969524848,
      714683780,
      3639785095,
      205050476,
      4266873199,
      3976438427,
      526918040,
      1361435347,
      2739821008,
      2954799652,
      1114974503,
      2529119692,
      1691668175,
      2005155131,
      2247081528,
      3690758684,
      697762079,
      986182379,
      3366744552,
      476452099,
      3993867776,
      4250756596,
      255256311,
      1640403810,
      2477592673,
      2164122517,
      1922457750,
      2791048317,
      1412925310,
      1197962378,
      3037525897,
      3944729517,
      427051182,
      170179418,
      4165941337,
      746937522,
      3740196785,
      3451792453,
      1070968646,
      1905808397,
      2213795598,
      2426610938,
      1657317369,
      3053634322,
      1147748369,
      1463399397,
      2773627110,
      4215344322,
      153784257,
      444234805,
      3893493558,
      1021025245,
      3467647198,
      3722505002,
      797665321,
      2197175160,
      1889384571,
      1674398607,
      2443626636,
      1164749927,
      3070701412,
      2757221520,
      1446797203,
      137323447,
      4198817972,
      3910406976,
      461344835,
      3484808360,
      1037989803,
      781091935,
      3705997148,
      2460548119,
      1623424788,
      1939049696,
      2180517859,
      1429367560,
      2807687179,
      3020495871,
      1180866812,
      410100952,
      3927582683,
      4182430767,
      186734380,
      3756733383,
      763408580,
      1053836080,
      3434856499,
      2722870694,
      1344288421,
      1131464017,
      2971354706,
      1708204729,
      2545590714,
      2229949006,
      1988219213,
      680717673,
      3673779818,
      3383336350,
      1002577565,
      4010310262,
      493091189,
      238226049,
      4233660802,
      2987750089,
      1082061258,
      1395524158,
      2705686845,
      1972364758,
      2279892693,
      2494862625,
      1725896226,
      952904198,
      3399985413,
      3656866545,
      731699698,
      4283874585,
      222117402,
      510512622,
      3959836397,
      3280807620,
      837199303,
      582374963,
      3504198960,
      68661723,
      4135334616,
      3844915500,
      390545967,
      1230274059,
      3141532936,
      2825850620,
      1510247935,
      2395924756,
      2091215383,
      1878366691,
      2644384480,
      3553878443,
      565732008,
      854102364,
      3229815391,
      340358836,
      3861050807,
      4117890627,
      119113024,
      1493875044,
      2875275879,
      3090270611,
      1247431312,
      2660249211,
      1828433272,
      2141937292,
      2378227087,
      3811616794,
      291187481,
      34330861,
      4032846830,
      615137029,
      3603020806,
      3314634738,
      939183345,
      1776939221,
      2609017814,
      2295496738,
      2058945313,
      2926798794,
      1545135305,
      1330124605,
      3173225534,
      4084100981,
      17165430,
      307568514,
      3762199681,
      888469610,
      3332340585,
      3587147933,
      665062302,
      2042050490,
      2346497209,
      2559330125,
      1793573966,
      3190661285,
      1279665062,
      1595330642,
      2910671697
    ];
    var lookupTable = (0, util_1.uint32ArrayFrom)(a_lookupTable);
    var aws_crc32c_1 = require_aws_crc32c();
    Object.defineProperty(exports, "AwsCrc32c", { enumerable: true, get: function() {
      return aws_crc32c_1.AwsCrc32c;
    } });
  }
});

// node_modules/@smithy/protocol-http/dist-es/extensions/httpExtensionConfiguration.js
var getHttpHandlerExtensionConfiguration = (runtimeConfig) => {
  let httpHandler = runtimeConfig.httpHandler;
  return {
    setHttpHandler(handler) {
      httpHandler = handler;
    },
    httpHandler() {
      return httpHandler;
    },
    updateHttpClientConfig(key, value) {
      httpHandler.updateHttpClientConfig(key, value);
    },
    httpHandlerConfigs() {
      return httpHandler.httpHandlerConfigs();
    }
  };
};
var resolveHttpHandlerRuntimeConfig = (httpHandlerExtensionConfiguration) => {
  return {
    httpHandler: httpHandlerExtensionConfiguration.httpHandler()
  };
};

// node_modules/@smithy/types/dist-es/auth/auth.js
var HttpAuthLocation;
(function(HttpAuthLocation2) {
  HttpAuthLocation2["HEADER"] = "header";
  HttpAuthLocation2["QUERY"] = "query";
})(HttpAuthLocation || (HttpAuthLocation = {}));

// node_modules/@smithy/types/dist-es/auth/HttpApiKeyAuth.js
var HttpApiKeyAuthLocation;
(function(HttpApiKeyAuthLocation2) {
  HttpApiKeyAuthLocation2["HEADER"] = "header";
  HttpApiKeyAuthLocation2["QUERY"] = "query";
})(HttpApiKeyAuthLocation || (HttpApiKeyAuthLocation = {}));

// node_modules/@smithy/types/dist-es/endpoint.js
var EndpointURLScheme;
(function(EndpointURLScheme2) {
  EndpointURLScheme2["HTTP"] = "http";
  EndpointURLScheme2["HTTPS"] = "https";
})(EndpointURLScheme || (EndpointURLScheme = {}));

// node_modules/@smithy/types/dist-es/extensions/checksum.js
var AlgorithmId;
(function(AlgorithmId2) {
  AlgorithmId2["MD5"] = "md5";
  AlgorithmId2["CRC32"] = "crc32";
  AlgorithmId2["CRC32C"] = "crc32c";
  AlgorithmId2["SHA1"] = "sha1";
  AlgorithmId2["SHA256"] = "sha256";
})(AlgorithmId || (AlgorithmId = {}));

// node_modules/@smithy/types/dist-es/http.js
var FieldPosition;
(function(FieldPosition2) {
  FieldPosition2[FieldPosition2["HEADER"] = 0] = "HEADER";
  FieldPosition2[FieldPosition2["TRAILER"] = 1] = "TRAILER";
})(FieldPosition || (FieldPosition = {}));

// node_modules/@smithy/types/dist-es/middleware.js
var SMITHY_CONTEXT_KEY = "__smithy_context";

// node_modules/@smithy/types/dist-es/profile.js
var IniSectionType;
(function(IniSectionType2) {
  IniSectionType2["PROFILE"] = "profile";
  IniSectionType2["SSO_SESSION"] = "sso-session";
  IniSectionType2["SERVICES"] = "services";
})(IniSectionType || (IniSectionType = {}));

// node_modules/@smithy/types/dist-es/transfer.js
var RequestHandlerProtocol;
(function(RequestHandlerProtocol2) {
  RequestHandlerProtocol2["HTTP_0_9"] = "http/0.9";
  RequestHandlerProtocol2["HTTP_1_0"] = "http/1.0";
  RequestHandlerProtocol2["TDS_8_0"] = "tds/8.0";
})(RequestHandlerProtocol || (RequestHandlerProtocol = {}));

// node_modules/@smithy/protocol-http/dist-es/httpRequest.js
var HttpRequest = class _HttpRequest {
  constructor(options) {
    this.method = options.method || "GET";
    this.hostname = options.hostname || "localhost";
    this.port = options.port;
    this.query = options.query || {};
    this.headers = options.headers || {};
    this.body = options.body;
    this.protocol = options.protocol ? options.protocol.slice(-1) !== ":" ? `${options.protocol}:` : options.protocol : "https:";
    this.path = options.path ? options.path.charAt(0) !== "/" ? `/${options.path}` : options.path : "/";
    this.username = options.username;
    this.password = options.password;
    this.fragment = options.fragment;
  }
  static isInstance(request) {
    if (!request)
      return false;
    const req = request;
    return "method" in req && "protocol" in req && "hostname" in req && "path" in req && typeof req["query"] === "object" && typeof req["headers"] === "object";
  }
  clone() {
    const cloned = new _HttpRequest({
      ...this,
      headers: { ...this.headers }
    });
    if (cloned.query)
      cloned.query = cloneQuery(cloned.query);
    return cloned;
  }
};
function cloneQuery(query) {
  return Object.keys(query).reduce((carry, paramName) => {
    const param = query[paramName];
    return {
      ...carry,
      [paramName]: Array.isArray(param) ? [...param] : param
    };
  }, {});
}

// node_modules/@smithy/protocol-http/dist-es/httpResponse.js
var HttpResponse = class {
  constructor(options) {
    this.statusCode = options.statusCode;
    this.reason = options.reason;
    this.headers = options.headers || {};
    this.body = options.body;
  }
  static isInstance(response) {
    if (!response)
      return false;
    const resp = response;
    return typeof resp.statusCode === "number" && typeof resp.headers === "object";
  }
};

// node_modules/@aws-sdk/middleware-expect-continue/dist-es/index.js
function addExpectContinueMiddleware(options) {
  return (next) => async (args) => {
    const { request } = args;
    if (HttpRequest.isInstance(request) && request.body && options.runtime === "node") {
      request.headers = {
        ...request.headers,
        Expect: "100-continue"
      };
    }
    return next({
      ...args,
      request
    });
  };
}
var addExpectContinueMiddlewareOptions = {
  step: "build",
  tags: ["SET_EXPECT_HEADER", "EXPECT_HEADER"],
  name: "addExpectContinueMiddleware",
  override: true
};
var getAddExpectContinuePlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(addExpectContinueMiddleware(options), addExpectContinueMiddlewareOptions);
  }
});

// node_modules/@aws-sdk/middleware-host-header/dist-es/index.js
function resolveHostHeaderConfig(input) {
  return input;
}
var hostHeaderMiddleware = (options) => (next) => async (args) => {
  if (!HttpRequest.isInstance(args.request))
    return next(args);
  const { request } = args;
  const { handlerProtocol = "" } = options.requestHandler.metadata || {};
  if (handlerProtocol.indexOf("h2") >= 0 && !request.headers[":authority"]) {
    delete request.headers["host"];
    request.headers[":authority"] = request.hostname + (request.port ? ":" + request.port : "");
  } else if (!request.headers["host"]) {
    let host = request.hostname;
    if (request.port != null)
      host += `:${request.port}`;
    request.headers["host"] = host;
  }
  return next(args);
};
var hostHeaderMiddlewareOptions = {
  name: "hostHeaderMiddleware",
  step: "build",
  priority: "low",
  tags: ["HOST"],
  override: true
};
var getHostHeaderPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(hostHeaderMiddleware(options), hostHeaderMiddlewareOptions);
  }
});

// node_modules/@aws-sdk/middleware-logger/dist-es/loggerMiddleware.js
var loggerMiddleware = () => (next, context) => async (args) => {
  try {
    const response = await next(args);
    const { clientName, commandName, logger: logger2, dynamoDbDocumentClientOptions = {} } = context;
    const { overrideInputFilterSensitiveLog, overrideOutputFilterSensitiveLog } = dynamoDbDocumentClientOptions;
    const inputFilterSensitiveLog = overrideInputFilterSensitiveLog ?? context.inputFilterSensitiveLog;
    const outputFilterSensitiveLog = overrideOutputFilterSensitiveLog ?? context.outputFilterSensitiveLog;
    const { $metadata, ...outputWithoutMetadata } = response.output;
    logger2?.info?.({
      clientName,
      commandName,
      input: inputFilterSensitiveLog(args.input),
      output: outputFilterSensitiveLog(outputWithoutMetadata),
      metadata: $metadata
    });
    return response;
  } catch (error) {
    const { clientName, commandName, logger: logger2, dynamoDbDocumentClientOptions = {} } = context;
    const { overrideInputFilterSensitiveLog } = dynamoDbDocumentClientOptions;
    const inputFilterSensitiveLog = overrideInputFilterSensitiveLog ?? context.inputFilterSensitiveLog;
    logger2?.error?.({
      clientName,
      commandName,
      input: inputFilterSensitiveLog(args.input),
      error,
      metadata: error.$metadata
    });
    throw error;
  }
};
var loggerMiddlewareOptions = {
  name: "loggerMiddleware",
  tags: ["LOGGER"],
  step: "initialize",
  override: true
};
var getLoggerPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(loggerMiddleware(), loggerMiddlewareOptions);
  }
});

// node_modules/@aws-sdk/middleware-recursion-detection/dist-es/index.js
var TRACE_ID_HEADER_NAME = "X-Amzn-Trace-Id";
var ENV_LAMBDA_FUNCTION_NAME = "AWS_LAMBDA_FUNCTION_NAME";
var ENV_TRACE_ID = "_X_AMZN_TRACE_ID";
var recursionDetectionMiddleware = (options) => (next) => async (args) => {
  const { request } = args;
  if (!HttpRequest.isInstance(request) || options.runtime !== "node" || request.headers.hasOwnProperty(TRACE_ID_HEADER_NAME)) {
    return next(args);
  }
  const functionName = process.env[ENV_LAMBDA_FUNCTION_NAME];
  const traceId = process.env[ENV_TRACE_ID];
  const nonEmptyString = (str) => typeof str === "string" && str.length > 0;
  if (nonEmptyString(functionName) && nonEmptyString(traceId)) {
    request.headers[TRACE_ID_HEADER_NAME] = traceId;
  }
  return next({
    ...args,
    request
  });
};
var addRecursionDetectionMiddlewareOptions = {
  step: "build",
  tags: ["RECURSION_DETECTION"],
  name: "recursionDetectionMiddleware",
  override: true,
  priority: "low"
};
var getRecursionDetectionPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(recursionDetectionMiddleware(options), addRecursionDetectionMiddlewareOptions);
  }
});

// node_modules/@smithy/smithy-client/dist-es/NoOpLogger.js
var NoOpLogger = class {
  trace() {
  }
  debug() {
  }
  info() {
  }
  warn() {
  }
  error() {
  }
};

// node_modules/@smithy/middleware-stack/dist-es/MiddlewareStack.js
var getAllAliases = (name, aliases) => {
  const _aliases = [];
  if (name) {
    _aliases.push(name);
  }
  if (aliases) {
    for (const alias of aliases) {
      _aliases.push(alias);
    }
  }
  return _aliases;
};
var getMiddlewareNameWithAliases = (name, aliases) => {
  return `${name || "anonymous"}${aliases && aliases.length > 0 ? ` (a.k.a. ${aliases.join(",")})` : ""}`;
};
var constructStack = () => {
  let absoluteEntries = [];
  let relativeEntries = [];
  let identifyOnResolve = false;
  const entriesNameSet = /* @__PURE__ */ new Set();
  const sort = (entries) => entries.sort((a2, b2) => stepWeights[b2.step] - stepWeights[a2.step] || priorityWeights[b2.priority || "normal"] - priorityWeights[a2.priority || "normal"]);
  const removeByName = (toRemove) => {
    let isRemoved = false;
    const filterCb = (entry) => {
      const aliases = getAllAliases(entry.name, entry.aliases);
      if (aliases.includes(toRemove)) {
        isRemoved = true;
        for (const alias of aliases) {
          entriesNameSet.delete(alias);
        }
        return false;
      }
      return true;
    };
    absoluteEntries = absoluteEntries.filter(filterCb);
    relativeEntries = relativeEntries.filter(filterCb);
    return isRemoved;
  };
  const removeByReference = (toRemove) => {
    let isRemoved = false;
    const filterCb = (entry) => {
      if (entry.middleware === toRemove) {
        isRemoved = true;
        for (const alias of getAllAliases(entry.name, entry.aliases)) {
          entriesNameSet.delete(alias);
        }
        return false;
      }
      return true;
    };
    absoluteEntries = absoluteEntries.filter(filterCb);
    relativeEntries = relativeEntries.filter(filterCb);
    return isRemoved;
  };
  const cloneTo = (toStack) => {
    absoluteEntries.forEach((entry) => {
      toStack.add(entry.middleware, { ...entry });
    });
    relativeEntries.forEach((entry) => {
      toStack.addRelativeTo(entry.middleware, { ...entry });
    });
    toStack.identifyOnResolve?.(stack.identifyOnResolve());
    return toStack;
  };
  const expandRelativeMiddlewareList = (from) => {
    const expandedMiddlewareList = [];
    from.before.forEach((entry) => {
      if (entry.before.length === 0 && entry.after.length === 0) {
        expandedMiddlewareList.push(entry);
      } else {
        expandedMiddlewareList.push(...expandRelativeMiddlewareList(entry));
      }
    });
    expandedMiddlewareList.push(from);
    from.after.reverse().forEach((entry) => {
      if (entry.before.length === 0 && entry.after.length === 0) {
        expandedMiddlewareList.push(entry);
      } else {
        expandedMiddlewareList.push(...expandRelativeMiddlewareList(entry));
      }
    });
    return expandedMiddlewareList;
  };
  const getMiddlewareList = (debug = false) => {
    const normalizedAbsoluteEntries = [];
    const normalizedRelativeEntries = [];
    const normalizedEntriesNameMap = {};
    absoluteEntries.forEach((entry) => {
      const normalizedEntry = {
        ...entry,
        before: [],
        after: []
      };
      for (const alias of getAllAliases(normalizedEntry.name, normalizedEntry.aliases)) {
        normalizedEntriesNameMap[alias] = normalizedEntry;
      }
      normalizedAbsoluteEntries.push(normalizedEntry);
    });
    relativeEntries.forEach((entry) => {
      const normalizedEntry = {
        ...entry,
        before: [],
        after: []
      };
      for (const alias of getAllAliases(normalizedEntry.name, normalizedEntry.aliases)) {
        normalizedEntriesNameMap[alias] = normalizedEntry;
      }
      normalizedRelativeEntries.push(normalizedEntry);
    });
    normalizedRelativeEntries.forEach((entry) => {
      if (entry.toMiddleware) {
        const toMiddleware = normalizedEntriesNameMap[entry.toMiddleware];
        if (toMiddleware === void 0) {
          if (debug) {
            return;
          }
          throw new Error(`${entry.toMiddleware} is not found when adding ${getMiddlewareNameWithAliases(entry.name, entry.aliases)} middleware ${entry.relation} ${entry.toMiddleware}`);
        }
        if (entry.relation === "after") {
          toMiddleware.after.push(entry);
        }
        if (entry.relation === "before") {
          toMiddleware.before.push(entry);
        }
      }
    });
    const mainChain = sort(normalizedAbsoluteEntries).map(expandRelativeMiddlewareList).reduce((wholeList, expandedMiddlewareList) => {
      wholeList.push(...expandedMiddlewareList);
      return wholeList;
    }, []);
    return mainChain;
  };
  const stack = {
    add: (middleware, options = {}) => {
      const { name, override, aliases: _aliases } = options;
      const entry = {
        step: "initialize",
        priority: "normal",
        middleware,
        ...options
      };
      const aliases = getAllAliases(name, _aliases);
      if (aliases.length > 0) {
        if (aliases.some((alias) => entriesNameSet.has(alias))) {
          if (!override)
            throw new Error(`Duplicate middleware name '${getMiddlewareNameWithAliases(name, _aliases)}'`);
          for (const alias of aliases) {
            const toOverrideIndex = absoluteEntries.findIndex((entry2) => entry2.name === alias || entry2.aliases?.some((a2) => a2 === alias));
            if (toOverrideIndex === -1) {
              continue;
            }
            const toOverride = absoluteEntries[toOverrideIndex];
            if (toOverride.step !== entry.step || entry.priority !== toOverride.priority) {
              throw new Error(`"${getMiddlewareNameWithAliases(toOverride.name, toOverride.aliases)}" middleware with ${toOverride.priority} priority in ${toOverride.step} step cannot be overridden by "${getMiddlewareNameWithAliases(name, _aliases)}" middleware with ${entry.priority} priority in ${entry.step} step.`);
            }
            absoluteEntries.splice(toOverrideIndex, 1);
          }
        }
        for (const alias of aliases) {
          entriesNameSet.add(alias);
        }
      }
      absoluteEntries.push(entry);
    },
    addRelativeTo: (middleware, options) => {
      const { name, override, aliases: _aliases } = options;
      const entry = {
        middleware,
        ...options
      };
      const aliases = getAllAliases(name, _aliases);
      if (aliases.length > 0) {
        if (aliases.some((alias) => entriesNameSet.has(alias))) {
          if (!override)
            throw new Error(`Duplicate middleware name '${getMiddlewareNameWithAliases(name, _aliases)}'`);
          for (const alias of aliases) {
            const toOverrideIndex = relativeEntries.findIndex((entry2) => entry2.name === alias || entry2.aliases?.some((a2) => a2 === alias));
            if (toOverrideIndex === -1) {
              continue;
            }
            const toOverride = relativeEntries[toOverrideIndex];
            if (toOverride.toMiddleware !== entry.toMiddleware || toOverride.relation !== entry.relation) {
              throw new Error(`"${getMiddlewareNameWithAliases(toOverride.name, toOverride.aliases)}" middleware ${toOverride.relation} "${toOverride.toMiddleware}" middleware cannot be overridden by "${getMiddlewareNameWithAliases(name, _aliases)}" middleware ${entry.relation} "${entry.toMiddleware}" middleware.`);
            }
            relativeEntries.splice(toOverrideIndex, 1);
          }
        }
        for (const alias of aliases) {
          entriesNameSet.add(alias);
        }
      }
      relativeEntries.push(entry);
    },
    clone: () => cloneTo(constructStack()),
    use: (plugin) => {
      plugin.applyToStack(stack);
    },
    remove: (toRemove) => {
      if (typeof toRemove === "string")
        return removeByName(toRemove);
      else
        return removeByReference(toRemove);
    },
    removeByTag: (toRemove) => {
      let isRemoved = false;
      const filterCb = (entry) => {
        const { tags, name, aliases: _aliases } = entry;
        if (tags && tags.includes(toRemove)) {
          const aliases = getAllAliases(name, _aliases);
          for (const alias of aliases) {
            entriesNameSet.delete(alias);
          }
          isRemoved = true;
          return false;
        }
        return true;
      };
      absoluteEntries = absoluteEntries.filter(filterCb);
      relativeEntries = relativeEntries.filter(filterCb);
      return isRemoved;
    },
    concat: (from) => {
      const cloned = cloneTo(constructStack());
      cloned.use(from);
      cloned.identifyOnResolve(identifyOnResolve || cloned.identifyOnResolve() || (from.identifyOnResolve?.() ?? false));
      return cloned;
    },
    applyToStack: cloneTo,
    identify: () => {
      return getMiddlewareList(true).map((mw) => {
        const step = mw.step ?? mw.relation + " " + mw.toMiddleware;
        return getMiddlewareNameWithAliases(mw.name, mw.aliases) + " - " + step;
      });
    },
    identifyOnResolve(toggle) {
      if (typeof toggle === "boolean")
        identifyOnResolve = toggle;
      return identifyOnResolve;
    },
    resolve: (handler, context) => {
      for (const middleware of getMiddlewareList().map((entry) => entry.middleware).reverse()) {
        handler = middleware(handler, context);
      }
      if (identifyOnResolve) {
        console.log(stack.identify());
      }
      return handler;
    }
  };
  return stack;
};
var stepWeights = {
  initialize: 5,
  serialize: 4,
  build: 3,
  finalizeRequest: 2,
  deserialize: 1
};
var priorityWeights = {
  high: 3,
  normal: 2,
  low: 1
};

// node_modules/@smithy/smithy-client/dist-es/client.js
var Client = class {
  constructor(config) {
    this.middlewareStack = constructStack();
    this.config = config;
  }
  send(command, optionsOrCb, cb2) {
    const options = typeof optionsOrCb !== "function" ? optionsOrCb : void 0;
    const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb2;
    const handler = command.resolveMiddleware(this.middlewareStack, this.config, options);
    if (callback) {
      handler(command).then((result) => callback(null, result.output), (err) => callback(err)).catch(() => {
      });
    } else {
      return handler(command).then((result) => result.output);
    }
  }
  destroy() {
    if (this.config.requestHandler.destroy)
      this.config.requestHandler.destroy();
  }
};

// node_modules/@smithy/util-base64/dist-es/constants.browser.js
var alphabetByEncoding = {};
var alphabetByValue = new Array(64);
for (let i2 = 0, start = "A".charCodeAt(0), limit = "Z".charCodeAt(0); i2 + start <= limit; i2++) {
  const char = String.fromCharCode(i2 + start);
  alphabetByEncoding[char] = i2;
  alphabetByValue[i2] = char;
}
for (let i2 = 0, start = "a".charCodeAt(0), limit = "z".charCodeAt(0); i2 + start <= limit; i2++) {
  const char = String.fromCharCode(i2 + start);
  const index = i2 + 26;
  alphabetByEncoding[char] = index;
  alphabetByValue[index] = char;
}
for (let i2 = 0; i2 < 10; i2++) {
  alphabetByEncoding[i2.toString(10)] = i2 + 52;
  const char = i2.toString(10);
  const index = i2 + 52;
  alphabetByEncoding[char] = index;
  alphabetByValue[index] = char;
}
alphabetByEncoding["+"] = 62;
alphabetByValue[62] = "+";
alphabetByEncoding["/"] = 63;
alphabetByValue[63] = "/";
var bitsPerLetter = 6;
var bitsPerByte = 8;
var maxLetterValue = 63;

// node_modules/@smithy/util-base64/dist-es/fromBase64.browser.js
var fromBase64 = (input) => {
  let totalByteLength = input.length / 4 * 3;
  if (input.slice(-2) === "==") {
    totalByteLength -= 2;
  } else if (input.slice(-1) === "=") {
    totalByteLength--;
  }
  const out = new ArrayBuffer(totalByteLength);
  const dataView = new DataView(out);
  for (let i2 = 0; i2 < input.length; i2 += 4) {
    let bits = 0;
    let bitLength = 0;
    for (let j2 = i2, limit = i2 + 3; j2 <= limit; j2++) {
      if (input[j2] !== "=") {
        if (!(input[j2] in alphabetByEncoding)) {
          throw new TypeError(`Invalid character ${input[j2]} in base64 string.`);
        }
        bits |= alphabetByEncoding[input[j2]] << (limit - j2) * bitsPerLetter;
        bitLength += bitsPerLetter;
      } else {
        bits >>= bitsPerLetter;
      }
    }
    const chunkOffset = i2 / 4 * 3;
    bits >>= bitLength % bitsPerByte;
    const byteLength = Math.floor(bitLength / bitsPerByte);
    for (let k2 = 0; k2 < byteLength; k2++) {
      const offset = (byteLength - k2 - 1) * bitsPerByte;
      dataView.setUint8(chunkOffset + k2, (bits & 255 << offset) >> offset);
    }
  }
  return new Uint8Array(out);
};

// node_modules/@smithy/util-utf8/dist-es/fromUtf8.browser.js
var fromUtf8 = (input) => new TextEncoder().encode(input);

// node_modules/@smithy/util-utf8/dist-es/toUint8Array.js
var toUint8Array = (data) => {
  if (typeof data === "string") {
    return fromUtf8(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
  }
  return new Uint8Array(data);
};

// node_modules/@smithy/util-utf8/dist-es/toUtf8.browser.js
var toUtf8 = (input) => {
  if (typeof input === "string") {
    return input;
  }
  if (typeof input !== "object" || typeof input.byteOffset !== "number" || typeof input.byteLength !== "number") {
    throw new Error("@smithy/util-utf8: toUtf8 encoder function only accepts string | Uint8Array.");
  }
  return new TextDecoder("utf-8").decode(input);
};

// node_modules/@smithy/util-base64/dist-es/toBase64.browser.js
function toBase64(_input) {
  let input;
  if (typeof _input === "string") {
    input = fromUtf8(_input);
  } else {
    input = _input;
  }
  const isArrayLike = typeof input === "object" && typeof input.length === "number";
  const isUint8Array = typeof input === "object" && typeof input.byteOffset === "number" && typeof input.byteLength === "number";
  if (!isArrayLike && !isUint8Array) {
    throw new Error("@smithy/util-base64: toBase64 encoder function only accepts string | Uint8Array.");
  }
  let str = "";
  for (let i2 = 0; i2 < input.length; i2 += 3) {
    let bits = 0;
    let bitLength = 0;
    for (let j2 = i2, limit = Math.min(i2 + 3, input.length); j2 < limit; j2++) {
      bits |= input[j2] << (limit - j2 - 1) * bitsPerByte;
      bitLength += bitsPerByte;
    }
    const bitClusterCount = Math.ceil(bitLength / bitsPerLetter);
    bits <<= bitClusterCount * bitsPerLetter - bitLength;
    for (let k2 = 1; k2 <= bitClusterCount; k2++) {
      const offset = (bitClusterCount - k2) * bitsPerLetter;
      str += alphabetByValue[(bits & maxLetterValue << offset) >> offset];
    }
    str += "==".slice(0, 4 - bitClusterCount);
  }
  return str;
}

// node_modules/@smithy/util-stream/dist-es/blob/transforms.js
function transformToString(payload, encoding = "utf-8") {
  if (encoding === "base64") {
    return toBase64(payload);
  }
  return toUtf8(payload);
}
function transformFromString(str, encoding) {
  if (encoding === "base64") {
    return Uint8ArrayBlobAdapter.mutate(fromBase64(str));
  }
  return Uint8ArrayBlobAdapter.mutate(fromUtf8(str));
}

// node_modules/@smithy/util-stream/dist-es/blob/Uint8ArrayBlobAdapter.js
var Uint8ArrayBlobAdapter = class _Uint8ArrayBlobAdapter extends Uint8Array {
  static fromString(source, encoding = "utf-8") {
    switch (typeof source) {
      case "string":
        return transformFromString(source, encoding);
      default:
        throw new Error(`Unsupported conversion from ${typeof source} to Uint8ArrayBlobAdapter.`);
    }
  }
  static mutate(source) {
    Object.setPrototypeOf(source, _Uint8ArrayBlobAdapter.prototype);
    return source;
  }
  transformToString(encoding = "utf-8") {
    return transformToString(this, encoding);
  }
};

// node_modules/@smithy/util-stream/dist-es/getAwsChunkedEncodingStream.browser.js
var getAwsChunkedEncodingStream = (readableStream, options) => {
  const { base64Encoder, bodyLengthChecker, checksumAlgorithmFn, checksumLocationName, streamHasher } = options;
  const checksumRequired = base64Encoder !== void 0 && bodyLengthChecker !== void 0 && checksumAlgorithmFn !== void 0 && checksumLocationName !== void 0 && streamHasher !== void 0;
  const digest = checksumRequired ? streamHasher(checksumAlgorithmFn, readableStream) : void 0;
  const reader = readableStream.getReader();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.enqueue(`0\r
`);
        if (checksumRequired) {
          const checksum = base64Encoder(await digest);
          controller.enqueue(`${checksumLocationName}:${checksum}\r
`);
          controller.enqueue(`\r
`);
        }
        controller.close();
      } else {
        controller.enqueue(`${(bodyLengthChecker(value) || 0).toString(16)}\r
${value}\r
`);
      }
    }
  });
};

// node_modules/@smithy/util-uri-escape/dist-es/escape-uri.js
var escapeUri = (uri) => encodeURIComponent(uri).replace(/[!'()*]/g, hexEncode);
var hexEncode = (c2) => `%${c2.charCodeAt(0).toString(16).toUpperCase()}`;

// node_modules/@smithy/querystring-builder/dist-es/index.js
function buildQueryString(query) {
  const parts = [];
  for (let key of Object.keys(query).sort()) {
    const value = query[key];
    key = escapeUri(key);
    if (Array.isArray(value)) {
      for (let i2 = 0, iLen = value.length; i2 < iLen; i2++) {
        parts.push(`${key}=${escapeUri(value[i2])}`);
      }
    } else {
      let qsEntry = key;
      if (value || typeof value === "string") {
        qsEntry += `=${escapeUri(value)}`;
      }
      parts.push(qsEntry);
    }
  }
  return parts.join("&");
}

// node_modules/@smithy/fetch-http-handler/dist-es/request-timeout.js
function requestTimeout(timeoutInMs = 0) {
  return new Promise((resolve, reject) => {
    if (timeoutInMs) {
      setTimeout(() => {
        const timeoutError = new Error(`Request did not complete within ${timeoutInMs} ms`);
        timeoutError.name = "TimeoutError";
        reject(timeoutError);
      }, timeoutInMs);
    }
  });
}

// node_modules/@smithy/fetch-http-handler/dist-es/fetch-http-handler.js
var keepAliveSupport = {
  supported: Boolean(typeof Request !== "undefined" && "keepalive" in new Request("https://[::1]"))
};
var FetchHttpHandler = class _FetchHttpHandler {
  static create(instanceOrOptions) {
    if (typeof instanceOrOptions?.handle === "function") {
      return instanceOrOptions;
    }
    return new _FetchHttpHandler(instanceOrOptions);
  }
  constructor(options) {
    if (typeof options === "function") {
      this.configProvider = options().then((opts) => opts || {});
    } else {
      this.config = options ?? {};
      this.configProvider = Promise.resolve(this.config);
    }
  }
  destroy() {
  }
  async handle(request, { abortSignal } = {}) {
    if (!this.config) {
      this.config = await this.configProvider;
    }
    const requestTimeoutInMs = this.config.requestTimeout;
    const keepAlive = this.config.keepAlive === true;
    if (abortSignal?.aborted) {
      const abortError = new Error("Request aborted");
      abortError.name = "AbortError";
      return Promise.reject(abortError);
    }
    let path = request.path;
    const queryString = buildQueryString(request.query || {});
    if (queryString) {
      path += `?${queryString}`;
    }
    if (request.fragment) {
      path += `#${request.fragment}`;
    }
    let auth = "";
    if (request.username != null || request.password != null) {
      const username = request.username ?? "";
      const password = request.password ?? "";
      auth = `${username}:${password}@`;
    }
    const { port, method } = request;
    const url = `${request.protocol}//${auth}${request.hostname}${port ? `:${port}` : ""}${path}`;
    const body = method === "GET" || method === "HEAD" ? void 0 : request.body;
    const requestOptions = { body, headers: new Headers(request.headers), method };
    if (typeof AbortController !== "undefined") {
      requestOptions["signal"] = abortSignal;
    }
    if (keepAliveSupport.supported) {
      requestOptions["keepalive"] = keepAlive;
    }
    const fetchRequest = new Request(url, requestOptions);
    const raceOfPromises = [
      fetch(fetchRequest).then((response) => {
        const fetchHeaders = response.headers;
        const transformedHeaders = {};
        for (const pair of fetchHeaders.entries()) {
          transformedHeaders[pair[0]] = pair[1];
        }
        const hasReadableStream = response.body != void 0;
        if (!hasReadableStream) {
          return response.blob().then((body2) => ({
            response: new HttpResponse({
              headers: transformedHeaders,
              reason: response.statusText,
              statusCode: response.status,
              body: body2
            })
          }));
        }
        return {
          response: new HttpResponse({
            headers: transformedHeaders,
            reason: response.statusText,
            statusCode: response.status,
            body: response.body
          })
        };
      }),
      requestTimeout(requestTimeoutInMs)
    ];
    if (abortSignal) {
      raceOfPromises.push(new Promise((resolve, reject) => {
        abortSignal.onabort = () => {
          const abortError = new Error("Request aborted");
          abortError.name = "AbortError";
          reject(abortError);
        };
      }));
    }
    return Promise.race(raceOfPromises);
  }
  updateHttpClientConfig(key, value) {
    this.config = void 0;
    this.configProvider = this.configProvider.then((config) => {
      config[key] = value;
      return config;
    });
  }
  httpHandlerConfigs() {
    return this.config ?? {};
  }
};

// node_modules/@smithy/fetch-http-handler/dist-es/stream-collector.js
var streamCollector = (stream) => {
  if (typeof Blob === "function" && stream instanceof Blob) {
    return collectBlob(stream);
  }
  return collectStream(stream);
};
async function collectBlob(blob) {
  const base64 = await readToBase64(blob);
  const arrayBuffer = fromBase64(base64);
  return new Uint8Array(arrayBuffer);
}
async function collectStream(stream) {
  let res = new Uint8Array(0);
  const reader = stream.getReader();
  let isDone = false;
  while (!isDone) {
    const { done, value } = await reader.read();
    if (value) {
      const prior = res;
      res = new Uint8Array(prior.length + value.length);
      res.set(prior);
      res.set(value, prior.length);
    }
    isDone = done;
  }
  return res;
}
function readToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.readyState !== 2) {
        return reject(new Error("Reader aborted too early"));
      }
      const result = reader.result ?? "";
      const commaIndex = result.indexOf(",");
      const dataOffset = commaIndex > -1 ? commaIndex + 1 : result.length;
      resolve(result.substring(dataOffset));
    };
    reader.onabort = () => reject(new Error("Read aborted"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// node_modules/@smithy/util-hex-encoding/dist-es/index.js
var SHORT_TO_HEX = {};
var HEX_TO_SHORT = {};
for (let i2 = 0; i2 < 256; i2++) {
  let encodedByte = i2.toString(16).toLowerCase();
  if (encodedByte.length === 1) {
    encodedByte = `0${encodedByte}`;
  }
  SHORT_TO_HEX[i2] = encodedByte;
  HEX_TO_SHORT[encodedByte] = i2;
}
function fromHex(encoded) {
  if (encoded.length % 2 !== 0) {
    throw new Error("Hex encoded strings must have an even number length");
  }
  const out = new Uint8Array(encoded.length / 2);
  for (let i2 = 0; i2 < encoded.length; i2 += 2) {
    const encodedByte = encoded.slice(i2, i2 + 2).toLowerCase();
    if (encodedByte in HEX_TO_SHORT) {
      out[i2 / 2] = HEX_TO_SHORT[encodedByte];
    } else {
      throw new Error(`Cannot decode unrecognized sequence ${encodedByte} as hexadecimal`);
    }
  }
  return out;
}
function toHex(bytes) {
  let out = "";
  for (let i2 = 0; i2 < bytes.byteLength; i2++) {
    out += SHORT_TO_HEX[bytes[i2]];
  }
  return out;
}

// node_modules/@smithy/util-stream/dist-es/sdk-stream-mixin.browser.js
var ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED = "The stream has already been transformed.";
var sdkStreamMixin = (stream) => {
  if (!isBlobInstance(stream) && !isReadableStreamInstance(stream)) {
    const name = stream?.__proto__?.constructor?.name || stream;
    throw new Error(`Unexpected stream implementation, expect Blob or ReadableStream, got ${name}`);
  }
  let transformed = false;
  const transformToByteArray = async () => {
    if (transformed) {
      throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
    }
    transformed = true;
    return await streamCollector(stream);
  };
  const blobToWebStream = (blob) => {
    if (typeof blob.stream !== "function") {
      throw new Error("Cannot transform payload Blob to web stream. Please make sure the Blob.stream() is polyfilled.\nIf you are using React Native, this API is not yet supported, see: https://react-native.canny.io/feature-requests/p/fetch-streaming-body");
    }
    return blob.stream();
  };
  return Object.assign(stream, {
    transformToByteArray,
    transformToString: async (encoding) => {
      const buf = await transformToByteArray();
      if (encoding === "base64") {
        return toBase64(buf);
      } else if (encoding === "hex") {
        return toHex(buf);
      } else if (encoding === void 0 || encoding === "utf8" || encoding === "utf-8") {
        return toUtf8(buf);
      } else if (typeof TextDecoder === "function") {
        return new TextDecoder(encoding).decode(buf);
      } else {
        throw new Error("TextDecoder is not available, please make sure polyfill is provided.");
      }
    },
    transformToWebStream: () => {
      if (transformed) {
        throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
      }
      transformed = true;
      if (isBlobInstance(stream)) {
        return blobToWebStream(stream);
      } else if (isReadableStreamInstance(stream)) {
        return stream;
      } else {
        throw new Error(`Cannot transform payload to web stream, got ${stream}`);
      }
    }
  });
};
var isBlobInstance = (stream) => typeof Blob === "function" && stream instanceof Blob;
var isReadableStreamInstance = (stream) => typeof ReadableStream === "function" && stream instanceof ReadableStream;

// node_modules/@smithy/smithy-client/dist-es/collect-stream-body.js
var collectBody = async (streamBody = new Uint8Array(), context) => {
  if (streamBody instanceof Uint8Array) {
    return Uint8ArrayBlobAdapter.mutate(streamBody);
  }
  if (!streamBody) {
    return Uint8ArrayBlobAdapter.mutate(new Uint8Array());
  }
  const fromContext = context.streamCollector(streamBody);
  return Uint8ArrayBlobAdapter.mutate(await fromContext);
};

// node_modules/@smithy/smithy-client/dist-es/command.js
var Command = class {
  constructor() {
    this.middlewareStack = constructStack();
  }
  static classBuilder() {
    return new ClassBuilder();
  }
  resolveMiddlewareWithContext(clientStack, configuration, options, { middlewareFn, clientName, commandName, inputFilterSensitiveLog, outputFilterSensitiveLog, smithyContext, additionalContext, CommandCtor }) {
    for (const mw of middlewareFn.bind(this)(CommandCtor, clientStack, configuration, options)) {
      this.middlewareStack.use(mw);
    }
    const stack = clientStack.concat(this.middlewareStack);
    const { logger: logger2 } = configuration;
    const handlerExecutionContext = {
      logger: logger2,
      clientName,
      commandName,
      inputFilterSensitiveLog,
      outputFilterSensitiveLog,
      [SMITHY_CONTEXT_KEY]: {
        ...smithyContext
      },
      ...additionalContext
    };
    const { requestHandler } = configuration;
    return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
  }
};
var ClassBuilder = class {
  constructor() {
    this._init = () => {
    };
    this._ep = {};
    this._middlewareFn = () => [];
    this._commandName = "";
    this._clientName = "";
    this._additionalContext = {};
    this._smithyContext = {};
    this._inputFilterSensitiveLog = (_) => _;
    this._outputFilterSensitiveLog = (_) => _;
    this._serializer = null;
    this._deserializer = null;
  }
  init(cb2) {
    this._init = cb2;
  }
  ep(endpointParameterInstructions) {
    this._ep = endpointParameterInstructions;
    return this;
  }
  m(middlewareSupplier) {
    this._middlewareFn = middlewareSupplier;
    return this;
  }
  s(service, operation, smithyContext = {}) {
    this._smithyContext = {
      service,
      operation,
      ...smithyContext
    };
    return this;
  }
  c(additionalContext = {}) {
    this._additionalContext = additionalContext;
    return this;
  }
  n(clientName, commandName) {
    this._clientName = clientName;
    this._commandName = commandName;
    return this;
  }
  f(inputFilter = (_) => _, outputFilter = (_) => _) {
    this._inputFilterSensitiveLog = inputFilter;
    this._outputFilterSensitiveLog = outputFilter;
    return this;
  }
  ser(serializer) {
    this._serializer = serializer;
    return this;
  }
  de(deserializer) {
    this._deserializer = deserializer;
    return this;
  }
  build() {
    const closure = this;
    let CommandRef;
    return CommandRef = class extends Command {
      static getEndpointParameterInstructions() {
        return closure._ep;
      }
      constructor(...[input]) {
        super();
        this.serialize = closure._serializer;
        this.deserialize = closure._deserializer;
        this.input = input ?? {};
        closure._init(this);
      }
      resolveMiddleware(stack, configuration, options) {
        return this.resolveMiddlewareWithContext(stack, configuration, options, {
          CommandCtor: CommandRef,
          middlewareFn: closure._middlewareFn,
          clientName: closure._clientName,
          commandName: closure._commandName,
          inputFilterSensitiveLog: closure._inputFilterSensitiveLog,
          outputFilterSensitiveLog: closure._outputFilterSensitiveLog,
          smithyContext: closure._smithyContext,
          additionalContext: closure._additionalContext
        });
      }
    };
  }
};

// node_modules/@smithy/smithy-client/dist-es/constants.js
var SENSITIVE_STRING = "***SensitiveInformation***";

// node_modules/@smithy/smithy-client/dist-es/parse-utils.js
var parseBoolean = (value) => {
  switch (value) {
    case "true":
      return true;
    case "false":
      return false;
    default:
      throw new Error(`Unable to parse boolean value "${value}"`);
  }
};
var expectNumber = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) {
      if (String(parsed) !== String(value)) {
        logger.warn(stackTraceWarning(`Expected number but observed string: ${value}`));
      }
      return parsed;
    }
  }
  if (typeof value === "number") {
    return value;
  }
  throw new TypeError(`Expected number, got ${typeof value}: ${value}`);
};
var MAX_FLOAT = Math.ceil(2 ** 127 * (2 - 2 ** -23));
var expectFloat32 = (value) => {
  const expected = expectNumber(value);
  if (expected !== void 0 && !Number.isNaN(expected) && expected !== Infinity && expected !== -Infinity) {
    if (Math.abs(expected) > MAX_FLOAT) {
      throw new TypeError(`Expected 32-bit float, got ${value}`);
    }
  }
  return expected;
};
var expectLong = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (Number.isInteger(value) && !Number.isNaN(value)) {
    return value;
  }
  throw new TypeError(`Expected integer, got ${typeof value}: ${value}`);
};
var expectInt32 = (value) => expectSizedInt(value, 32);
var expectShort = (value) => expectSizedInt(value, 16);
var expectByte = (value) => expectSizedInt(value, 8);
var expectSizedInt = (value, size) => {
  const expected = expectLong(value);
  if (expected !== void 0 && castInt(expected, size) !== expected) {
    throw new TypeError(`Expected ${size}-bit integer, got ${value}`);
  }
  return expected;
};
var castInt = (value, size) => {
  switch (size) {
    case 32:
      return Int32Array.of(value)[0];
    case 16:
      return Int16Array.of(value)[0];
    case 8:
      return Int8Array.of(value)[0];
  }
};
var expectNonNull = (value, location) => {
  if (value === null || value === void 0) {
    if (location) {
      throw new TypeError(`Expected a non-null value for ${location}`);
    }
    throw new TypeError("Expected a non-null value");
  }
  return value;
};
var expectObject = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  const receivedType = Array.isArray(value) ? "array" : typeof value;
  throw new TypeError(`Expected object, got ${receivedType}: ${value}`);
};
var expectString = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (typeof value === "string") {
    return value;
  }
  if (["boolean", "number", "bigint"].includes(typeof value)) {
    logger.warn(stackTraceWarning(`Expected string, got ${typeof value}: ${value}`));
    return String(value);
  }
  throw new TypeError(`Expected string, got ${typeof value}: ${value}`);
};
var strictParseFloat32 = (value) => {
  if (typeof value == "string") {
    return expectFloat32(parseNumber(value));
  }
  return expectFloat32(value);
};
var NUMBER_REGEX = /(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|(-?Infinity)|(NaN)/g;
var parseNumber = (value) => {
  const matches = value.match(NUMBER_REGEX);
  if (matches === null || matches[0].length !== value.length) {
    throw new TypeError(`Expected real number, got implicit NaN`);
  }
  return parseFloat(value);
};
var strictParseLong = (value) => {
  if (typeof value === "string") {
    return expectLong(parseNumber(value));
  }
  return expectLong(value);
};
var strictParseInt32 = (value) => {
  if (typeof value === "string") {
    return expectInt32(parseNumber(value));
  }
  return expectInt32(value);
};
var strictParseShort = (value) => {
  if (typeof value === "string") {
    return expectShort(parseNumber(value));
  }
  return expectShort(value);
};
var strictParseByte = (value) => {
  if (typeof value === "string") {
    return expectByte(parseNumber(value));
  }
  return expectByte(value);
};
var stackTraceWarning = (message) => {
  return String(new TypeError(message).stack || message).split("\n").slice(0, 5).filter((s2) => !s2.includes("stackTraceWarning")).join("\n");
};
var logger = {
  warn: console.warn
};

// node_modules/@smithy/smithy-client/dist-es/date-utils.js
var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateToUtcString(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const dayOfWeek = date.getUTCDay();
  const dayOfMonthInt = date.getUTCDate();
  const hoursInt = date.getUTCHours();
  const minutesInt = date.getUTCMinutes();
  const secondsInt = date.getUTCSeconds();
  const dayOfMonthString = dayOfMonthInt < 10 ? `0${dayOfMonthInt}` : `${dayOfMonthInt}`;
  const hoursString = hoursInt < 10 ? `0${hoursInt}` : `${hoursInt}`;
  const minutesString = minutesInt < 10 ? `0${minutesInt}` : `${minutesInt}`;
  const secondsString = secondsInt < 10 ? `0${secondsInt}` : `${secondsInt}`;
  return `${DAYS[dayOfWeek]}, ${dayOfMonthString} ${MONTHS[month]} ${year} ${hoursString}:${minutesString}:${secondsString} GMT`;
}
var RFC3339 = new RegExp(/^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?[zZ]$/);
var RFC3339_WITH_OFFSET = new RegExp(/^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(([-+]\d{2}\:\d{2})|[zZ])$/);
var parseRfc3339DateTimeWithOffset = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (typeof value !== "string") {
    throw new TypeError("RFC-3339 date-times must be expressed as strings");
  }
  const match = RFC3339_WITH_OFFSET.exec(value);
  if (!match) {
    throw new TypeError("Invalid RFC-3339 date-time value");
  }
  const [_, yearStr, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds, offsetStr] = match;
  const year = strictParseShort(stripLeadingZeroes(yearStr));
  const month = parseDateValue(monthStr, "month", 1, 12);
  const day = parseDateValue(dayStr, "day", 1, 31);
  const date = buildDate(year, month, day, { hours, minutes, seconds, fractionalMilliseconds });
  if (offsetStr.toUpperCase() != "Z") {
    date.setTime(date.getTime() - parseOffsetToMilliseconds(offsetStr));
  }
  return date;
};
var IMF_FIXDATE = new RegExp(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? GMT$/);
var RFC_850_DATE = new RegExp(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? GMT$/);
var ASC_TIME = new RegExp(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( [1-9]|\d{2}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? (\d{4})$/);
var parseRfc7231DateTime = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (typeof value !== "string") {
    throw new TypeError("RFC-7231 date-times must be expressed as strings");
  }
  let match = IMF_FIXDATE.exec(value);
  if (match) {
    const [_, dayStr, monthStr, yearStr, hours, minutes, seconds, fractionalMilliseconds] = match;
    return buildDate(strictParseShort(stripLeadingZeroes(yearStr)), parseMonthByShortName(monthStr), parseDateValue(dayStr, "day", 1, 31), { hours, minutes, seconds, fractionalMilliseconds });
  }
  match = RFC_850_DATE.exec(value);
  if (match) {
    const [_, dayStr, monthStr, yearStr, hours, minutes, seconds, fractionalMilliseconds] = match;
    return adjustRfc850Year(buildDate(parseTwoDigitYear(yearStr), parseMonthByShortName(monthStr), parseDateValue(dayStr, "day", 1, 31), {
      hours,
      minutes,
      seconds,
      fractionalMilliseconds
    }));
  }
  match = ASC_TIME.exec(value);
  if (match) {
    const [_, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds, yearStr] = match;
    return buildDate(strictParseShort(stripLeadingZeroes(yearStr)), parseMonthByShortName(monthStr), parseDateValue(dayStr.trimLeft(), "day", 1, 31), { hours, minutes, seconds, fractionalMilliseconds });
  }
  throw new TypeError("Invalid RFC-7231 date-time value");
};
var buildDate = (year, month, day, time) => {
  const adjustedMonth = month - 1;
  validateDayOfMonth(year, adjustedMonth, day);
  return new Date(Date.UTC(year, adjustedMonth, day, parseDateValue(time.hours, "hour", 0, 23), parseDateValue(time.minutes, "minute", 0, 59), parseDateValue(time.seconds, "seconds", 0, 60), parseMilliseconds(time.fractionalMilliseconds)));
};
var parseTwoDigitYear = (value) => {
  const thisYear = (/* @__PURE__ */ new Date()).getUTCFullYear();
  const valueInThisCentury = Math.floor(thisYear / 100) * 100 + strictParseShort(stripLeadingZeroes(value));
  if (valueInThisCentury < thisYear) {
    return valueInThisCentury + 100;
  }
  return valueInThisCentury;
};
var FIFTY_YEARS_IN_MILLIS = 50 * 365 * 24 * 60 * 60 * 1e3;
var adjustRfc850Year = (input) => {
  if (input.getTime() - (/* @__PURE__ */ new Date()).getTime() > FIFTY_YEARS_IN_MILLIS) {
    return new Date(Date.UTC(input.getUTCFullYear() - 100, input.getUTCMonth(), input.getUTCDate(), input.getUTCHours(), input.getUTCMinutes(), input.getUTCSeconds(), input.getUTCMilliseconds()));
  }
  return input;
};
var parseMonthByShortName = (value) => {
  const monthIdx = MONTHS.indexOf(value);
  if (monthIdx < 0) {
    throw new TypeError(`Invalid month: ${value}`);
  }
  return monthIdx + 1;
};
var DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var validateDayOfMonth = (year, month, day) => {
  let maxDays = DAYS_IN_MONTH[month];
  if (month === 1 && isLeapYear(year)) {
    maxDays = 29;
  }
  if (day > maxDays) {
    throw new TypeError(`Invalid day for ${MONTHS[month]} in ${year}: ${day}`);
  }
};
var isLeapYear = (year) => {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
};
var parseDateValue = (value, type, lower, upper) => {
  const dateVal = strictParseByte(stripLeadingZeroes(value));
  if (dateVal < lower || dateVal > upper) {
    throw new TypeError(`${type} must be between ${lower} and ${upper}, inclusive`);
  }
  return dateVal;
};
var parseMilliseconds = (value) => {
  if (value === null || value === void 0) {
    return 0;
  }
  return strictParseFloat32("0." + value) * 1e3;
};
var parseOffsetToMilliseconds = (value) => {
  const directionStr = value[0];
  let direction = 1;
  if (directionStr == "+") {
    direction = 1;
  } else if (directionStr == "-") {
    direction = -1;
  } else {
    throw new TypeError(`Offset direction, ${directionStr}, must be "+" or "-"`);
  }
  const hour = Number(value.substring(1, 3));
  const minute = Number(value.substring(4, 6));
  return direction * (hour * 60 + minute) * 60 * 1e3;
};
var stripLeadingZeroes = (value) => {
  let idx = 0;
  while (idx < value.length - 1 && value.charAt(idx) === "0") {
    idx++;
  }
  if (idx === 0) {
    return value;
  }
  return value.slice(idx);
};

// node_modules/@smithy/smithy-client/dist-es/exceptions.js
var ServiceException = class _ServiceException extends Error {
  constructor(options) {
    super(options.message);
    Object.setPrototypeOf(this, _ServiceException.prototype);
    this.name = options.name;
    this.$fault = options.$fault;
    this.$metadata = options.$metadata;
  }
};
var decorateServiceException = (exception, additions = {}) => {
  Object.entries(additions).filter(([, v2]) => v2 !== void 0).forEach(([k2, v2]) => {
    if (exception[k2] == void 0 || exception[k2] === "") {
      exception[k2] = v2;
    }
  });
  const message = exception.message || exception.Message || "UnknownError";
  exception.message = message;
  delete exception.Message;
  return exception;
};

// node_modules/@smithy/smithy-client/dist-es/default-error-handler.js
var throwDefaultError = ({ output, parsedBody, exceptionCtor, errorCode }) => {
  const $metadata = deserializeMetadata(output);
  const statusCode = $metadata.httpStatusCode ? $metadata.httpStatusCode + "" : void 0;
  const response = new exceptionCtor({
    name: parsedBody?.code || parsedBody?.Code || errorCode || statusCode || "UnknownError",
    $fault: "client",
    $metadata
  });
  throw decorateServiceException(response, parsedBody);
};
var withBaseException = (ExceptionCtor) => {
  return ({ output, parsedBody, errorCode }) => {
    throwDefaultError({ output, parsedBody, exceptionCtor: ExceptionCtor, errorCode });
  };
};
var deserializeMetadata = (output) => ({
  httpStatusCode: output.statusCode,
  requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
  extendedRequestId: output.headers["x-amz-id-2"],
  cfId: output.headers["x-amz-cf-id"]
});

// node_modules/@smithy/smithy-client/dist-es/defaults-mode.js
var loadConfigsForDefaultMode = (mode) => {
  switch (mode) {
    case "standard":
      return {
        retryMode: "standard",
        connectionTimeout: 3100
      };
    case "in-region":
      return {
        retryMode: "standard",
        connectionTimeout: 1100
      };
    case "cross-region":
      return {
        retryMode: "standard",
        connectionTimeout: 3100
      };
    case "mobile":
      return {
        retryMode: "standard",
        connectionTimeout: 3e4
      };
    default:
      return {};
  }
};

// node_modules/@smithy/smithy-client/dist-es/extensions/checksum.js
var getChecksumConfiguration2 = (runtimeConfig) => {
  const checksumAlgorithms = [];
  for (const id in AlgorithmId) {
    const algorithmId = AlgorithmId[id];
    if (runtimeConfig[algorithmId] === void 0) {
      continue;
    }
    checksumAlgorithms.push({
      algorithmId: () => algorithmId,
      checksumConstructor: () => runtimeConfig[algorithmId]
    });
  }
  return {
    _checksumAlgorithms: checksumAlgorithms,
    addChecksumAlgorithm(algo) {
      this._checksumAlgorithms.push(algo);
    },
    checksumAlgorithms() {
      return this._checksumAlgorithms;
    }
  };
};
var resolveChecksumRuntimeConfig2 = (clientConfig) => {
  const runtimeConfig = {};
  clientConfig.checksumAlgorithms().forEach((checksumAlgorithm) => {
    runtimeConfig[checksumAlgorithm.algorithmId()] = checksumAlgorithm.checksumConstructor();
  });
  return runtimeConfig;
};

// node_modules/@smithy/smithy-client/dist-es/extensions/retry.js
var getRetryConfiguration = (runtimeConfig) => {
  let _retryStrategy = runtimeConfig.retryStrategy;
  return {
    setRetryStrategy(retryStrategy) {
      _retryStrategy = retryStrategy;
    },
    retryStrategy() {
      return _retryStrategy;
    }
  };
};
var resolveRetryRuntimeConfig = (retryStrategyConfiguration) => {
  const runtimeConfig = {};
  runtimeConfig.retryStrategy = retryStrategyConfiguration.retryStrategy();
  return runtimeConfig;
};

// node_modules/@smithy/smithy-client/dist-es/extensions/defaultExtensionConfiguration.js
var getDefaultExtensionConfiguration = (runtimeConfig) => {
  return {
    ...getChecksumConfiguration2(runtimeConfig),
    ...getRetryConfiguration(runtimeConfig)
  };
};
var resolveDefaultRuntimeConfig = (config) => {
  return {
    ...resolveChecksumRuntimeConfig2(config),
    ...resolveRetryRuntimeConfig(config)
  };
};

// node_modules/@smithy/smithy-client/dist-es/extended-encode-uri-component.js
function extendedEncodeURIComponent(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, function(c2) {
    return "%" + c2.charCodeAt(0).toString(16).toUpperCase();
  });
}

// node_modules/@smithy/smithy-client/dist-es/get-array-if-single-item.js
var getArrayIfSingleItem = (mayBeArray) => Array.isArray(mayBeArray) ? mayBeArray : [mayBeArray];

// node_modules/@smithy/smithy-client/dist-es/get-value-from-text-node.js
var getValueFromTextNode = (obj) => {
  const textNodeName = "#text";
  for (const key in obj) {
    if (obj.hasOwnProperty(key) && obj[key][textNodeName] !== void 0) {
      obj[key] = obj[key][textNodeName];
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      obj[key] = getValueFromTextNode(obj[key]);
    }
  }
  return obj;
};

// node_modules/@smithy/smithy-client/dist-es/lazy-json.js
var StringWrapper = function() {
  const Class = Object.getPrototypeOf(this).constructor;
  const Constructor = Function.bind.apply(String, [null, ...arguments]);
  const instance = new Constructor();
  Object.setPrototypeOf(instance, Class.prototype);
  return instance;
};
StringWrapper.prototype = Object.create(String.prototype, {
  constructor: {
    value: StringWrapper,
    enumerable: false,
    writable: true,
    configurable: true
  }
});
Object.setPrototypeOf(StringWrapper, String);

// node_modules/@smithy/smithy-client/dist-es/object-mapping.js
function map(arg0, arg1, arg2) {
  let target;
  let filter;
  let instructions;
  if (typeof arg1 === "undefined" && typeof arg2 === "undefined") {
    target = {};
    instructions = arg0;
  } else {
    target = arg0;
    if (typeof arg1 === "function") {
      filter = arg1;
      instructions = arg2;
      return mapWithFilter(target, filter, instructions);
    } else {
      instructions = arg1;
    }
  }
  for (const key of Object.keys(instructions)) {
    if (!Array.isArray(instructions[key])) {
      target[key] = instructions[key];
      continue;
    }
    applyInstruction(target, null, instructions, key);
  }
  return target;
}
var mapWithFilter = (target, filter, instructions) => {
  return map(target, Object.entries(instructions).reduce((_instructions, [key, value]) => {
    if (Array.isArray(value)) {
      _instructions[key] = value;
    } else {
      if (typeof value === "function") {
        _instructions[key] = [filter, value()];
      } else {
        _instructions[key] = [filter, value];
      }
    }
    return _instructions;
  }, {}));
};
var applyInstruction = (target, source, instructions, targetKey) => {
  if (source !== null) {
    let instruction = instructions[targetKey];
    if (typeof instruction === "function") {
      instruction = [, instruction];
    }
    const [filter2 = nonNullish, valueFn = pass, sourceKey = targetKey] = instruction;
    if (typeof filter2 === "function" && filter2(source[sourceKey]) || typeof filter2 !== "function" && !!filter2) {
      target[targetKey] = valueFn(source[sourceKey]);
    }
    return;
  }
  let [filter, value] = instructions[targetKey];
  if (typeof value === "function") {
    let _value;
    const defaultFilterPassed = filter === void 0 && (_value = value()) != null;
    const customFilterPassed = typeof filter === "function" && !!filter(void 0) || typeof filter !== "function" && !!filter;
    if (defaultFilterPassed) {
      target[targetKey] = _value;
    } else if (customFilterPassed) {
      target[targetKey] = value();
    }
  } else {
    const defaultFilterPassed = filter === void 0 && value != null;
    const customFilterPassed = typeof filter === "function" && !!filter(value) || typeof filter !== "function" && !!filter;
    if (defaultFilterPassed || customFilterPassed) {
      target[targetKey] = value;
    }
  }
};
var nonNullish = (_) => _ != null;
var pass = (_) => _;

// node_modules/@smithy/smithy-client/dist-es/resolve-path.js
var resolvedPath = (resolvedPath2, input, memberName, labelValueProvider, uriLabel, isGreedyLabel) => {
  if (input != null && input[memberName] !== void 0) {
    const labelValue = labelValueProvider();
    if (labelValue.length <= 0) {
      throw new Error("Empty value provided for input HTTP label: " + memberName + ".");
    }
    resolvedPath2 = resolvedPath2.replace(uriLabel, isGreedyLabel ? labelValue.split("/").map((segment) => extendedEncodeURIComponent(segment)).join("/") : extendedEncodeURIComponent(labelValue));
  } else {
    throw new Error("No value provided for input HTTP label: " + memberName + ".");
  }
  return resolvedPath2;
};

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/check-content-length-header.js
var CONTENT_LENGTH_HEADER = "content-length";
function checkContentLengthHeader() {
  return (next, context) => async (args) => {
    const { request } = args;
    if (HttpRequest.isInstance(request)) {
      if (!(CONTENT_LENGTH_HEADER in request.headers)) {
        const message = `Are you using a Stream of unknown length as the Body of a PutObject request? Consider using Upload instead from @aws-sdk/lib-storage.`;
        if (typeof context?.logger?.warn === "function" && !(context.logger instanceof NoOpLogger)) {
          context.logger.warn(message);
        } else {
          console.warn(message);
        }
      }
    }
    return next({ ...args });
  };
}
var checkContentLengthHeaderMiddlewareOptions = {
  step: "finalizeRequest",
  tags: ["CHECK_CONTENT_LENGTH_HEADER"],
  name: "getCheckContentLengthHeaderPlugin",
  override: true
};
var getCheckContentLengthHeaderPlugin = (unused) => ({
  applyToStack: (clientStack) => {
    clientStack.add(checkContentLengthHeader(), checkContentLengthHeaderMiddlewareOptions);
  }
});

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/region-redirect-endpoint-middleware.js
var regionRedirectEndpointMiddleware = (config) => {
  return (next, context) => async (args) => {
    const originalRegion = await config.region();
    const regionProviderRef = config.region;
    if (context.__s3RegionRedirect) {
      config.region = async () => {
        config.region = regionProviderRef;
        return context.__s3RegionRedirect;
      };
    }
    const result = await next(args);
    if (context.__s3RegionRedirect) {
      const region = await config.region();
      if (originalRegion !== region) {
        throw new Error("Region was not restored following S3 region redirect.");
      }
    }
    return result;
  };
};
var regionRedirectEndpointMiddlewareOptions = {
  tags: ["REGION_REDIRECT", "S3"],
  name: "regionRedirectEndpointMiddleware",
  override: true,
  relation: "before",
  toMiddleware: "endpointV2Middleware"
};

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/region-redirect-middleware.js
function regionRedirectMiddleware(clientConfig) {
  return (next, context) => async (args) => {
    try {
      return await next(args);
    } catch (err) {
      if (clientConfig.followRegionRedirects && err?.$metadata?.httpStatusCode === 301) {
        try {
          const actualRegion = err.$response.headers["x-amz-bucket-region"];
          context.logger?.debug(`Redirecting from ${await clientConfig.region()} to ${actualRegion}`);
          context.__s3RegionRedirect = actualRegion;
        } catch (e2) {
          throw new Error("Region redirect failed: " + e2);
        }
        return next(args);
      } else {
        throw err;
      }
    }
  };
}
var regionRedirectMiddlewareOptions = {
  step: "initialize",
  tags: ["REGION_REDIRECT", "S3"],
  name: "regionRedirectMiddleware",
  override: true
};
var getRegionRedirectMiddlewarePlugin = (clientConfig) => ({
  applyToStack: (clientStack) => {
    clientStack.add(regionRedirectMiddleware(clientConfig), regionRedirectMiddlewareOptions);
    clientStack.addRelativeTo(regionRedirectEndpointMiddleware(clientConfig), regionRedirectEndpointMiddlewareOptions);
  }
});

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/s3-expires-middleware.js
var s3ExpiresMiddleware = (config) => {
  return (next, context) => async (args) => {
    const result = await next(args);
    const { response } = result;
    if (HttpResponse.isInstance(response)) {
      if (response.headers.expires) {
        response.headers.expiresstring = response.headers.expires;
        try {
          parseRfc7231DateTime(response.headers.expires);
        } catch (e2) {
          context.logger?.warn(`AWS SDK Warning for ${context.clientName}::${context.commandName} response parsing (${response.headers.expires}): ${e2}`);
          delete response.headers.expires;
        }
      }
    }
    return result;
  };
};
var s3ExpiresMiddlewareOptions = {
  tags: ["S3"],
  name: "s3ExpiresMiddleware",
  override: true,
  relation: "after",
  toMiddleware: "deserializerMiddleware"
};
var getS3ExpiresMiddlewarePlugin = (clientConfig) => ({
  applyToStack: (clientStack) => {
    clientStack.addRelativeTo(s3ExpiresMiddleware(clientConfig), s3ExpiresMiddlewareOptions);
  }
});

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/s3-express/classes/S3ExpressIdentityCache.js
var S3ExpressIdentityCache = class _S3ExpressIdentityCache {
  constructor(data = {}) {
    this.data = data;
    this.lastPurgeTime = Date.now();
  }
  get(key) {
    const entry = this.data[key];
    if (!entry) {
      return;
    }
    return entry;
  }
  set(key, entry) {
    this.data[key] = entry;
    return entry;
  }
  delete(key) {
    delete this.data[key];
  }
  async purgeExpired() {
    const now = Date.now();
    if (this.lastPurgeTime + _S3ExpressIdentityCache.EXPIRED_CREDENTIAL_PURGE_INTERVAL_MS > now) {
      return;
    }
    for (const key in this.data) {
      const entry = this.data[key];
      if (!entry.isRefreshing) {
        const credential = await entry.identity;
        if (credential.expiration) {
          if (credential.expiration.getTime() < now) {
            delete this.data[key];
          }
        }
      }
    }
  }
};
S3ExpressIdentityCache.EXPIRED_CREDENTIAL_PURGE_INTERVAL_MS = 3e4;

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/s3-express/classes/S3ExpressIdentityCacheEntry.js
var S3ExpressIdentityCacheEntry = class {
  constructor(_identity, isRefreshing = false, accessed = Date.now()) {
    this._identity = _identity;
    this.isRefreshing = isRefreshing;
    this.accessed = accessed;
  }
  get identity() {
    this.accessed = Date.now();
    return this._identity;
  }
};

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/s3-express/classes/S3ExpressIdentityProviderImpl.js
var S3ExpressIdentityProviderImpl = class _S3ExpressIdentityProviderImpl {
  constructor(createSessionFn, cache = new S3ExpressIdentityCache()) {
    this.createSessionFn = createSessionFn;
    this.cache = cache;
  }
  async getS3ExpressIdentity(awsIdentity, identityProperties) {
    const key = identityProperties.Bucket;
    const { cache } = this;
    const entry = cache.get(key);
    if (entry) {
      return entry.identity.then((identity) => {
        const isExpired = (identity.expiration?.getTime() ?? 0) < Date.now();
        if (isExpired) {
          return cache.set(key, new S3ExpressIdentityCacheEntry(this.getIdentity(key))).identity;
        }
        const isExpiringSoon = (identity.expiration?.getTime() ?? 0) < Date.now() + _S3ExpressIdentityProviderImpl.REFRESH_WINDOW_MS;
        if (isExpiringSoon && !entry.isRefreshing) {
          entry.isRefreshing = true;
          this.getIdentity(key).then((id) => {
            cache.set(key, new S3ExpressIdentityCacheEntry(Promise.resolve(id)));
          });
        }
        return identity;
      });
    }
    return cache.set(key, new S3ExpressIdentityCacheEntry(this.getIdentity(key))).identity;
  }
  async getIdentity(key) {
    await this.cache.purgeExpired().catch((error) => {
      console.warn("Error while clearing expired entries in S3ExpressIdentityCache: \n" + error);
    });
    const session = await this.createSessionFn(key);
    if (!session.Credentials?.AccessKeyId || !session.Credentials?.SecretAccessKey) {
      throw new Error("s3#createSession response credential missing AccessKeyId or SecretAccessKey.");
    }
    const identity = {
      accessKeyId: session.Credentials.AccessKeyId,
      secretAccessKey: session.Credentials.SecretAccessKey,
      sessionToken: session.Credentials.SessionToken,
      expiration: session.Credentials.Expiration ? new Date(session.Credentials.Expiration) : void 0
    };
    return identity;
  }
};
S3ExpressIdentityProviderImpl.REFRESH_WINDOW_MS = 6e4;

// node_modules/@smithy/util-middleware/dist-es/getSmithyContext.js
var getSmithyContext = (context) => context[SMITHY_CONTEXT_KEY] || (context[SMITHY_CONTEXT_KEY] = {});

// node_modules/@smithy/util-middleware/dist-es/normalizeProvider.js
var normalizeProvider = (input) => {
  if (typeof input === "function")
    return input;
  const promisified = Promise.resolve(input);
  return () => promisified;
};

// node_modules/@smithy/signature-v4/dist-es/constants.js
var ALGORITHM_QUERY_PARAM = "X-Amz-Algorithm";
var CREDENTIAL_QUERY_PARAM = "X-Amz-Credential";
var AMZ_DATE_QUERY_PARAM = "X-Amz-Date";
var SIGNED_HEADERS_QUERY_PARAM = "X-Amz-SignedHeaders";
var EXPIRES_QUERY_PARAM = "X-Amz-Expires";
var SIGNATURE_QUERY_PARAM = "X-Amz-Signature";
var TOKEN_QUERY_PARAM = "X-Amz-Security-Token";
var AUTH_HEADER = "authorization";
var AMZ_DATE_HEADER = AMZ_DATE_QUERY_PARAM.toLowerCase();
var DATE_HEADER = "date";
var GENERATED_HEADERS = [AUTH_HEADER, AMZ_DATE_HEADER, DATE_HEADER];
var SIGNATURE_HEADER = SIGNATURE_QUERY_PARAM.toLowerCase();
var SHA256_HEADER = "x-amz-content-sha256";
var TOKEN_HEADER = TOKEN_QUERY_PARAM.toLowerCase();
var ALWAYS_UNSIGNABLE_HEADERS = {
  authorization: true,
  "cache-control": true,
  connection: true,
  expect: true,
  from: true,
  "keep-alive": true,
  "max-forwards": true,
  pragma: true,
  referer: true,
  te: true,
  trailer: true,
  "transfer-encoding": true,
  upgrade: true,
  "user-agent": true,
  "x-amzn-trace-id": true
};
var PROXY_HEADER_PATTERN = /^proxy-/;
var SEC_HEADER_PATTERN = /^sec-/;
var ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256";
var EVENT_ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256-PAYLOAD";
var UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
var MAX_CACHE_SIZE = 50;
var KEY_TYPE_IDENTIFIER = "aws4_request";
var MAX_PRESIGNED_TTL = 60 * 60 * 24 * 7;

// node_modules/@smithy/signature-v4/dist-es/credentialDerivation.js
var signingKeyCache = {};
var cacheQueue = [];
var createScope = (shortDate, region, service) => `${shortDate}/${region}/${service}/${KEY_TYPE_IDENTIFIER}`;
var getSigningKey = async (sha256Constructor, credentials, shortDate, region, service) => {
  const credsHash = await hmac(sha256Constructor, credentials.secretAccessKey, credentials.accessKeyId);
  const cacheKey = `${shortDate}:${region}:${service}:${toHex(credsHash)}:${credentials.sessionToken}`;
  if (cacheKey in signingKeyCache) {
    return signingKeyCache[cacheKey];
  }
  cacheQueue.push(cacheKey);
  while (cacheQueue.length > MAX_CACHE_SIZE) {
    delete signingKeyCache[cacheQueue.shift()];
  }
  let key = `AWS4${credentials.secretAccessKey}`;
  for (const signable of [shortDate, region, service, KEY_TYPE_IDENTIFIER]) {
    key = await hmac(sha256Constructor, key, signable);
  }
  return signingKeyCache[cacheKey] = key;
};
var hmac = (ctor, secret, data) => {
  const hash = new ctor(secret);
  hash.update(toUint8Array(data));
  return hash.digest();
};

// node_modules/@smithy/signature-v4/dist-es/getCanonicalHeaders.js
var getCanonicalHeaders = ({ headers }, unsignableHeaders, signableHeaders) => {
  const canonical = {};
  for (const headerName of Object.keys(headers).sort()) {
    if (headers[headerName] == void 0) {
      continue;
    }
    const canonicalHeaderName = headerName.toLowerCase();
    if (canonicalHeaderName in ALWAYS_UNSIGNABLE_HEADERS || unsignableHeaders?.has(canonicalHeaderName) || PROXY_HEADER_PATTERN.test(canonicalHeaderName) || SEC_HEADER_PATTERN.test(canonicalHeaderName)) {
      if (!signableHeaders || signableHeaders && !signableHeaders.has(canonicalHeaderName)) {
        continue;
      }
    }
    canonical[canonicalHeaderName] = headers[headerName].trim().replace(/\s+/g, " ");
  }
  return canonical;
};

// node_modules/@smithy/signature-v4/dist-es/getCanonicalQuery.js
var getCanonicalQuery = ({ query = {} }) => {
  const keys = [];
  const serialized = {};
  for (const key of Object.keys(query).sort()) {
    if (key.toLowerCase() === SIGNATURE_HEADER) {
      continue;
    }
    keys.push(key);
    const value = query[key];
    if (typeof value === "string") {
      serialized[key] = `${escapeUri(key)}=${escapeUri(value)}`;
    } else if (Array.isArray(value)) {
      serialized[key] = value.slice(0).reduce((encoded, value2) => encoded.concat([`${escapeUri(key)}=${escapeUri(value2)}`]), []).sort().join("&");
    }
  }
  return keys.map((key) => serialized[key]).filter((serialized2) => serialized2).join("&");
};

// node_modules/@smithy/is-array-buffer/dist-es/index.js
var isArrayBuffer = (arg) => typeof ArrayBuffer === "function" && arg instanceof ArrayBuffer || Object.prototype.toString.call(arg) === "[object ArrayBuffer]";

// node_modules/@smithy/signature-v4/dist-es/getPayloadHash.js
var getPayloadHash = async ({ headers, body }, hashConstructor) => {
  for (const headerName of Object.keys(headers)) {
    if (headerName.toLowerCase() === SHA256_HEADER) {
      return headers[headerName];
    }
  }
  if (body == void 0) {
    return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  } else if (typeof body === "string" || ArrayBuffer.isView(body) || isArrayBuffer(body)) {
    const hashCtor = new hashConstructor();
    hashCtor.update(toUint8Array(body));
    return toHex(await hashCtor.digest());
  }
  return UNSIGNED_PAYLOAD;
};

// node_modules/@smithy/signature-v4/dist-es/HeaderFormatter.js
var HeaderFormatter = class {
  format(headers) {
    const chunks = [];
    for (const headerName of Object.keys(headers)) {
      const bytes = fromUtf8(headerName);
      chunks.push(Uint8Array.from([bytes.byteLength]), bytes, this.formatHeaderValue(headers[headerName]));
    }
    const out = new Uint8Array(chunks.reduce((carry, bytes) => carry + bytes.byteLength, 0));
    let position = 0;
    for (const chunk of chunks) {
      out.set(chunk, position);
      position += chunk.byteLength;
    }
    return out;
  }
  formatHeaderValue(header) {
    switch (header.type) {
      case "boolean":
        return Uint8Array.from([header.value ? 0 : 1]);
      case "byte":
        return Uint8Array.from([2, header.value]);
      case "short":
        const shortView = new DataView(new ArrayBuffer(3));
        shortView.setUint8(0, 3);
        shortView.setInt16(1, header.value, false);
        return new Uint8Array(shortView.buffer);
      case "integer":
        const intView = new DataView(new ArrayBuffer(5));
        intView.setUint8(0, 4);
        intView.setInt32(1, header.value, false);
        return new Uint8Array(intView.buffer);
      case "long":
        const longBytes = new Uint8Array(9);
        longBytes[0] = 5;
        longBytes.set(header.value.bytes, 1);
        return longBytes;
      case "binary":
        const binView = new DataView(new ArrayBuffer(3 + header.value.byteLength));
        binView.setUint8(0, 6);
        binView.setUint16(1, header.value.byteLength, false);
        const binBytes = new Uint8Array(binView.buffer);
        binBytes.set(header.value, 3);
        return binBytes;
      case "string":
        const utf8Bytes = fromUtf8(header.value);
        const strView = new DataView(new ArrayBuffer(3 + utf8Bytes.byteLength));
        strView.setUint8(0, 7);
        strView.setUint16(1, utf8Bytes.byteLength, false);
        const strBytes = new Uint8Array(strView.buffer);
        strBytes.set(utf8Bytes, 3);
        return strBytes;
      case "timestamp":
        const tsBytes = new Uint8Array(9);
        tsBytes[0] = 8;
        tsBytes.set(Int64.fromNumber(header.value.valueOf()).bytes, 1);
        return tsBytes;
      case "uuid":
        if (!UUID_PATTERN.test(header.value)) {
          throw new Error(`Invalid UUID received: ${header.value}`);
        }
        const uuidBytes = new Uint8Array(17);
        uuidBytes[0] = 9;
        uuidBytes.set(fromHex(header.value.replace(/\-/g, "")), 1);
        return uuidBytes;
    }
  }
};
var HEADER_VALUE_TYPE;
(function(HEADER_VALUE_TYPE3) {
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["boolTrue"] = 0] = "boolTrue";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["boolFalse"] = 1] = "boolFalse";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["byte"] = 2] = "byte";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["short"] = 3] = "short";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["integer"] = 4] = "integer";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["long"] = 5] = "long";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["byteArray"] = 6] = "byteArray";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["string"] = 7] = "string";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["timestamp"] = 8] = "timestamp";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["uuid"] = 9] = "uuid";
})(HEADER_VALUE_TYPE || (HEADER_VALUE_TYPE = {}));
var UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
var Int64 = class _Int64 {
  constructor(bytes) {
    this.bytes = bytes;
    if (bytes.byteLength !== 8) {
      throw new Error("Int64 buffers must be exactly 8 bytes");
    }
  }
  static fromNumber(number) {
    if (number > 9223372036854776e3 || number < -9223372036854776e3) {
      throw new Error(`${number} is too large (or, if negative, too small) to represent as an Int64`);
    }
    const bytes = new Uint8Array(8);
    for (let i2 = 7, remaining = Math.abs(Math.round(number)); i2 > -1 && remaining > 0; i2--, remaining /= 256) {
      bytes[i2] = remaining;
    }
    if (number < 0) {
      negate(bytes);
    }
    return new _Int64(bytes);
  }
  valueOf() {
    const bytes = this.bytes.slice(0);
    const negative = bytes[0] & 128;
    if (negative) {
      negate(bytes);
    }
    return parseInt(toHex(bytes), 16) * (negative ? -1 : 1);
  }
  toString() {
    return String(this.valueOf());
  }
};
function negate(bytes) {
  for (let i2 = 0; i2 < 8; i2++) {
    bytes[i2] ^= 255;
  }
  for (let i2 = 7; i2 > -1; i2--) {
    bytes[i2]++;
    if (bytes[i2] !== 0)
      break;
  }
}

// node_modules/@smithy/signature-v4/dist-es/headerUtil.js
var hasHeader = (soughtHeader, headers) => {
  soughtHeader = soughtHeader.toLowerCase();
  for (const headerName of Object.keys(headers)) {
    if (soughtHeader === headerName.toLowerCase()) {
      return true;
    }
  }
  return false;
};

// node_modules/@smithy/signature-v4/dist-es/cloneRequest.js
var cloneRequest = ({ headers, query, ...rest }) => ({
  ...rest,
  headers: { ...headers },
  query: query ? cloneQuery2(query) : void 0
});
var cloneQuery2 = (query) => Object.keys(query).reduce((carry, paramName) => {
  const param = query[paramName];
  return {
    ...carry,
    [paramName]: Array.isArray(param) ? [...param] : param
  };
}, {});

// node_modules/@smithy/signature-v4/dist-es/moveHeadersToQuery.js
var moveHeadersToQuery = (request, options = {}) => {
  const { headers, query = {} } = typeof request.clone === "function" ? request.clone() : cloneRequest(request);
  for (const name of Object.keys(headers)) {
    const lname = name.toLowerCase();
    if (lname.slice(0, 6) === "x-amz-" && !options.unhoistableHeaders?.has(lname)) {
      query[name] = headers[name];
      delete headers[name];
    }
  }
  return {
    ...request,
    headers,
    query
  };
};

// node_modules/@smithy/signature-v4/dist-es/prepareRequest.js
var prepareRequest = (request) => {
  request = typeof request.clone === "function" ? request.clone() : cloneRequest(request);
  for (const headerName of Object.keys(request.headers)) {
    if (GENERATED_HEADERS.indexOf(headerName.toLowerCase()) > -1) {
      delete request.headers[headerName];
    }
  }
  return request;
};

// node_modules/@smithy/signature-v4/dist-es/utilDate.js
var iso8601 = (time) => toDate(time).toISOString().replace(/\.\d{3}Z$/, "Z");
var toDate = (time) => {
  if (typeof time === "number") {
    return new Date(time * 1e3);
  }
  if (typeof time === "string") {
    if (Number(time)) {
      return new Date(Number(time) * 1e3);
    }
    return new Date(time);
  }
  return time;
};

// node_modules/@smithy/signature-v4/dist-es/SignatureV4.js
var SignatureV4 = class {
  constructor({ applyChecksum, credentials, region, service, sha256, uriEscapePath = true }) {
    this.headerFormatter = new HeaderFormatter();
    this.service = service;
    this.sha256 = sha256;
    this.uriEscapePath = uriEscapePath;
    this.applyChecksum = typeof applyChecksum === "boolean" ? applyChecksum : true;
    this.regionProvider = normalizeProvider(region);
    this.credentialProvider = normalizeProvider(credentials);
  }
  async presign(originalRequest, options = {}) {
    const { signingDate = /* @__PURE__ */ new Date(), expiresIn = 3600, unsignableHeaders, unhoistableHeaders, signableHeaders, signingRegion, signingService } = options;
    const credentials = await this.credentialProvider();
    this.validateResolvedCredentials(credentials);
    const region = signingRegion ?? await this.regionProvider();
    const { longDate, shortDate } = formatDate(signingDate);
    if (expiresIn > MAX_PRESIGNED_TTL) {
      return Promise.reject("Signature version 4 presigned URLs must have an expiration date less than one week in the future");
    }
    const scope = createScope(shortDate, region, signingService ?? this.service);
    const request = moveHeadersToQuery(prepareRequest(originalRequest), { unhoistableHeaders });
    if (credentials.sessionToken) {
      request.query[TOKEN_QUERY_PARAM] = credentials.sessionToken;
    }
    request.query[ALGORITHM_QUERY_PARAM] = ALGORITHM_IDENTIFIER;
    request.query[CREDENTIAL_QUERY_PARAM] = `${credentials.accessKeyId}/${scope}`;
    request.query[AMZ_DATE_QUERY_PARAM] = longDate;
    request.query[EXPIRES_QUERY_PARAM] = expiresIn.toString(10);
    const canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
    request.query[SIGNED_HEADERS_QUERY_PARAM] = getCanonicalHeaderList(canonicalHeaders);
    request.query[SIGNATURE_QUERY_PARAM] = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, await getPayloadHash(originalRequest, this.sha256)));
    return request;
  }
  async sign(toSign, options) {
    if (typeof toSign === "string") {
      return this.signString(toSign, options);
    } else if (toSign.headers && toSign.payload) {
      return this.signEvent(toSign, options);
    } else if (toSign.message) {
      return this.signMessage(toSign, options);
    } else {
      return this.signRequest(toSign, options);
    }
  }
  async signEvent({ headers, payload }, { signingDate = /* @__PURE__ */ new Date(), priorSignature, signingRegion, signingService }) {
    const region = signingRegion ?? await this.regionProvider();
    const { shortDate, longDate } = formatDate(signingDate);
    const scope = createScope(shortDate, region, signingService ?? this.service);
    const hashedPayload = await getPayloadHash({ headers: {}, body: payload }, this.sha256);
    const hash = new this.sha256();
    hash.update(headers);
    const hashedHeaders = toHex(await hash.digest());
    const stringToSign = [
      EVENT_ALGORITHM_IDENTIFIER,
      longDate,
      scope,
      priorSignature,
      hashedHeaders,
      hashedPayload
    ].join("\n");
    return this.signString(stringToSign, { signingDate, signingRegion: region, signingService });
  }
  async signMessage(signableMessage, { signingDate = /* @__PURE__ */ new Date(), signingRegion, signingService }) {
    const promise = this.signEvent({
      headers: this.headerFormatter.format(signableMessage.message.headers),
      payload: signableMessage.message.body
    }, {
      signingDate,
      signingRegion,
      signingService,
      priorSignature: signableMessage.priorSignature
    });
    return promise.then((signature) => {
      return { message: signableMessage.message, signature };
    });
  }
  async signString(stringToSign, { signingDate = /* @__PURE__ */ new Date(), signingRegion, signingService } = {}) {
    const credentials = await this.credentialProvider();
    this.validateResolvedCredentials(credentials);
    const region = signingRegion ?? await this.regionProvider();
    const { shortDate } = formatDate(signingDate);
    const hash = new this.sha256(await this.getSigningKey(credentials, region, shortDate, signingService));
    hash.update(toUint8Array(stringToSign));
    return toHex(await hash.digest());
  }
  async signRequest(requestToSign, { signingDate = /* @__PURE__ */ new Date(), signableHeaders, unsignableHeaders, signingRegion, signingService } = {}) {
    const credentials = await this.credentialProvider();
    this.validateResolvedCredentials(credentials);
    const region = signingRegion ?? await this.regionProvider();
    const request = prepareRequest(requestToSign);
    const { longDate, shortDate } = formatDate(signingDate);
    const scope = createScope(shortDate, region, signingService ?? this.service);
    request.headers[AMZ_DATE_HEADER] = longDate;
    if (credentials.sessionToken) {
      request.headers[TOKEN_HEADER] = credentials.sessionToken;
    }
    const payloadHash = await getPayloadHash(request, this.sha256);
    if (!hasHeader(SHA256_HEADER, request.headers) && this.applyChecksum) {
      request.headers[SHA256_HEADER] = payloadHash;
    }
    const canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
    const signature = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, payloadHash));
    request.headers[AUTH_HEADER] = `${ALGORITHM_IDENTIFIER} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${getCanonicalHeaderList(canonicalHeaders)}, Signature=${signature}`;
    return request;
  }
  createCanonicalRequest(request, canonicalHeaders, payloadHash) {
    const sortedHeaders = Object.keys(canonicalHeaders).sort();
    return `${request.method}
${this.getCanonicalPath(request)}
${getCanonicalQuery(request)}
${sortedHeaders.map((name) => `${name}:${canonicalHeaders[name]}`).join("\n")}

${sortedHeaders.join(";")}
${payloadHash}`;
  }
  async createStringToSign(longDate, credentialScope, canonicalRequest) {
    const hash = new this.sha256();
    hash.update(toUint8Array(canonicalRequest));
    const hashedRequest = await hash.digest();
    return `${ALGORITHM_IDENTIFIER}
${longDate}
${credentialScope}
${toHex(hashedRequest)}`;
  }
  getCanonicalPath({ path }) {
    if (this.uriEscapePath) {
      const normalizedPathSegments = [];
      for (const pathSegment of path.split("/")) {
        if (pathSegment?.length === 0)
          continue;
        if (pathSegment === ".")
          continue;
        if (pathSegment === "..") {
          normalizedPathSegments.pop();
        } else {
          normalizedPathSegments.push(pathSegment);
        }
      }
      const normalizedPath = `${path?.startsWith("/") ? "/" : ""}${normalizedPathSegments.join("/")}${normalizedPathSegments.length > 0 && path?.endsWith("/") ? "/" : ""}`;
      const doubleEncoded = escapeUri(normalizedPath);
      return doubleEncoded.replace(/%2F/g, "/");
    }
    return path;
  }
  async getSignature(longDate, credentialScope, keyPromise, canonicalRequest) {
    const stringToSign = await this.createStringToSign(longDate, credentialScope, canonicalRequest);
    const hash = new this.sha256(await keyPromise);
    hash.update(toUint8Array(stringToSign));
    return toHex(await hash.digest());
  }
  getSigningKey(credentials, region, shortDate, service) {
    return getSigningKey(this.sha256, credentials, shortDate, region, service || this.service);
  }
  validateResolvedCredentials(credentials) {
    if (typeof credentials !== "object" || typeof credentials.accessKeyId !== "string" || typeof credentials.secretAccessKey !== "string") {
      throw new Error("Resolved credential object is not valid");
    }
  }
};
var formatDate = (now) => {
  const longDate = iso8601(now).replace(/[\-:]/g, "");
  return {
    longDate,
    shortDate: longDate.slice(0, 8)
  };
};
var getCanonicalHeaderList = (headers) => Object.keys(headers).sort().join(";");

// node_modules/@smithy/util-config-provider/dist-es/types.js
var SelectorType;
(function(SelectorType2) {
  SelectorType2["ENV"] = "env";
  SelectorType2["CONFIG"] = "shared config entry";
})(SelectorType || (SelectorType = {}));

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/s3-express/constants.js
var S3_EXPRESS_BUCKET_TYPE = "Directory";
var S3_EXPRESS_BACKEND = "S3Express";
var S3_EXPRESS_AUTH_SCHEME = "sigv4-s3express";
var SESSION_TOKEN_QUERY_PARAM = "X-Amz-S3session-Token";
var SESSION_TOKEN_HEADER = SESSION_TOKEN_QUERY_PARAM.toLowerCase();

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/s3-express/classes/SignatureV4S3Express.js
var SignatureV4S3Express = class extends SignatureV4 {
  async signWithCredentials(requestToSign, credentials, options) {
    const credentialsWithoutSessionToken = getCredentialsWithoutSessionToken(credentials);
    requestToSign.headers[SESSION_TOKEN_HEADER] = credentials.sessionToken;
    const privateAccess = this;
    setSingleOverride(privateAccess, credentialsWithoutSessionToken);
    return privateAccess.signRequest(requestToSign, options ?? {});
  }
  async presignWithCredentials(requestToSign, credentials, options) {
    const credentialsWithoutSessionToken = getCredentialsWithoutSessionToken(credentials);
    delete requestToSign.headers[SESSION_TOKEN_HEADER];
    requestToSign.headers[SESSION_TOKEN_QUERY_PARAM] = credentials.sessionToken;
    requestToSign.query = requestToSign.query ?? {};
    requestToSign.query[SESSION_TOKEN_QUERY_PARAM] = credentials.sessionToken;
    const privateAccess = this;
    setSingleOverride(privateAccess, credentialsWithoutSessionToken);
    return this.presign(requestToSign, options);
  }
};
function getCredentialsWithoutSessionToken(credentials) {
  const credentialsWithoutSessionToken = {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    expiration: credentials.expiration
  };
  return credentialsWithoutSessionToken;
}
function setSingleOverride(privateAccess, credentialsWithoutSessionToken) {
  const id = setTimeout(() => {
    throw new Error("SignatureV4S3Express credential override was created but not called.");
  }, 10);
  const currentCredentialProvider = privateAccess.credentialProvider;
  const overrideCredentialsProviderOnce = () => {
    clearTimeout(id);
    privateAccess.credentialProvider = currentCredentialProvider;
    return Promise.resolve(credentialsWithoutSessionToken);
  };
  privateAccess.credentialProvider = overrideCredentialsProviderOnce;
}

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/s3-express/functions/s3ExpressMiddleware.js
var s3ExpressMiddleware = (options) => {
  return (next, context) => async (args) => {
    if (context.endpointV2) {
      const endpoint = context.endpointV2;
      const isS3ExpressAuth = endpoint.properties?.authSchemes?.[0]?.name === S3_EXPRESS_AUTH_SCHEME;
      const isS3ExpressBucket = endpoint.properties?.backend === S3_EXPRESS_BACKEND || endpoint.properties?.bucketType === S3_EXPRESS_BUCKET_TYPE;
      if (isS3ExpressBucket) {
        context.isS3ExpressBucket = true;
      }
      if (isS3ExpressAuth) {
        const requestBucket = args.input.Bucket;
        if (requestBucket) {
          const s3ExpressIdentity = await options.s3ExpressIdentityProvider.getS3ExpressIdentity(await options.credentials(), {
            Bucket: requestBucket
          });
          context.s3ExpressIdentity = s3ExpressIdentity;
          if (HttpRequest.isInstance(args.request) && s3ExpressIdentity.sessionToken) {
            args.request.headers[SESSION_TOKEN_HEADER] = s3ExpressIdentity.sessionToken;
          }
        }
      }
    }
    return next(args);
  };
};
var s3ExpressMiddlewareOptions = {
  name: "s3ExpressMiddleware",
  step: "build",
  tags: ["S3", "S3_EXPRESS"],
  override: true
};
var getS3ExpressPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(s3ExpressMiddleware(options), s3ExpressMiddlewareOptions);
  }
});

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/s3Configuration.js
var resolveS3Config = (input, { session }) => {
  const [s3ClientProvider, CreateSessionCommandCtor] = session;
  return {
    ...input,
    forcePathStyle: input.forcePathStyle ?? false,
    useAccelerateEndpoint: input.useAccelerateEndpoint ?? false,
    disableMultiregionAccessPoints: input.disableMultiregionAccessPoints ?? false,
    followRegionRedirects: input.followRegionRedirects ?? false,
    s3ExpressIdentityProvider: input.s3ExpressIdentityProvider ?? new S3ExpressIdentityProviderImpl(async (key) => s3ClientProvider().send(new CreateSessionCommandCtor({
      Bucket: key,
      SessionMode: "ReadWrite"
    }))),
    bucketEndpoint: input.bucketEndpoint ?? false
  };
};

// node_modules/@aws-sdk/util-arn-parser/dist-es/index.js
var validate = (str) => typeof str === "string" && str.indexOf("arn:") === 0 && str.split(":").length >= 6;

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/bucket-endpoint-middleware.js
function bucketEndpointMiddleware(options) {
  return (next, context) => async (args) => {
    if (options.bucketEndpoint) {
      const endpoint = context.endpointV2;
      if (endpoint) {
        const bucket = args.input.Bucket;
        if (typeof bucket === "string") {
          try {
            const bucketEndpointUrl = new URL(bucket);
            endpoint.url = bucketEndpointUrl;
          } catch (e2) {
            const warning = `@aws-sdk/middleware-sdk-s3: bucketEndpoint=true was set but Bucket=${bucket} could not be parsed as URL.`;
            if (context.logger?.constructor?.name === "NoOpLogger") {
              console.warn(warning);
            } else {
              context.logger?.warn?.(warning);
            }
            throw e2;
          }
        }
      }
    }
    return next(args);
  };
}
var bucketEndpointMiddlewareOptions = {
  name: "bucketEndpointMiddleware",
  override: true,
  relation: "after",
  toMiddleware: "endpointV2Middleware"
};

// node_modules/@aws-sdk/middleware-sdk-s3/dist-es/validate-bucket-name.js
function validateBucketNameMiddleware({ bucketEndpoint }) {
  return (next) => async (args) => {
    const { input: { Bucket } } = args;
    if (!bucketEndpoint && typeof Bucket === "string" && !validate(Bucket) && Bucket.indexOf("/") >= 0) {
      const err = new Error(`Bucket name shouldn't contain '/', received '${Bucket}'`);
      err.name = "InvalidBucketName";
      throw err;
    }
    return next({ ...args });
  };
}
var validateBucketNameMiddlewareOptions = {
  step: "initialize",
  tags: ["VALIDATE_BUCKET_NAME"],
  name: "validateBucketNameMiddleware",
  override: true
};
var getValidateBucketNamePlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(validateBucketNameMiddleware(options), validateBucketNameMiddlewareOptions);
    clientStack.addRelativeTo(bucketEndpointMiddleware(options), bucketEndpointMiddlewareOptions);
  }
});

// node_modules/@smithy/property-provider/dist-es/memoize.js
var memoize = (provider, isExpired, requiresRefresh) => {
  let resolved;
  let pending;
  let hasResult;
  let isConstant = false;
  const coalesceProvider = async () => {
    if (!pending) {
      pending = provider();
    }
    try {
      resolved = await pending;
      hasResult = true;
      isConstant = false;
    } finally {
      pending = void 0;
    }
    return resolved;
  };
  if (isExpired === void 0) {
    return async (options) => {
      if (!hasResult || options?.forceRefresh) {
        resolved = await coalesceProvider();
      }
      return resolved;
    };
  }
  return async (options) => {
    if (!hasResult || options?.forceRefresh) {
      resolved = await coalesceProvider();
    }
    if (isConstant) {
      return resolved;
    }
    if (requiresRefresh && !requiresRefresh(resolved)) {
      isConstant = true;
      return resolved;
    }
    if (isExpired(resolved)) {
      await coalesceProvider();
      return resolved;
    }
    return resolved;
  };
};

// node_modules/@aws-sdk/middleware-signing/dist-es/awsAuthConfiguration.js
var CREDENTIAL_EXPIRE_WINDOW = 3e5;
var resolveAwsAuthConfig = (input) => {
  const normalizedCreds = input.credentials ? normalizeCredentialProvider(input.credentials) : input.credentialDefaultProvider(Object.assign({}, input, {
    parentClientConfig: input
  }));
  const { signingEscapePath = true, systemClockOffset = input.systemClockOffset || 0, sha256 } = input;
  let signer;
  if (input.signer) {
    signer = normalizeProvider(input.signer);
  } else if (input.regionInfoProvider) {
    signer = () => normalizeProvider(input.region)().then(async (region) => [
      await input.regionInfoProvider(region, {
        useFipsEndpoint: await input.useFipsEndpoint(),
        useDualstackEndpoint: await input.useDualstackEndpoint()
      }) || {},
      region
    ]).then(([regionInfo, region]) => {
      const { signingRegion, signingService } = regionInfo;
      input.signingRegion = input.signingRegion || signingRegion || region;
      input.signingName = input.signingName || signingService || input.serviceId;
      const params = {
        ...input,
        credentials: normalizedCreds,
        region: input.signingRegion,
        service: input.signingName,
        sha256,
        uriEscapePath: signingEscapePath
      };
      const SignerCtor = input.signerConstructor || SignatureV4;
      return new SignerCtor(params);
    });
  } else {
    signer = async (authScheme) => {
      authScheme = Object.assign({}, {
        name: "sigv4",
        signingName: input.signingName || input.defaultSigningName,
        signingRegion: await normalizeProvider(input.region)(),
        properties: {}
      }, authScheme);
      const isSigv4a = authScheme?.name === "sigv4a";
      const signingRegion = authScheme.signingRegion;
      const signingService = authScheme.signingName;
      let regionForSigner;
      if (isSigv4a) {
        regionForSigner = input.signingRegion || signingRegion;
      } else {
        input.signingRegion = input.signingRegion || signingRegion;
        regionForSigner = input.signingRegion;
      }
      input.signingName = input.signingName || signingService || input.serviceId;
      const params = {
        ...input,
        credentials: normalizedCreds,
        region: regionForSigner,
        service: input.signingName,
        sha256,
        uriEscapePath: signingEscapePath
      };
      const SignerCtor = input.signerConstructor || SignatureV4;
      return new SignerCtor(params);
    };
  }
  return {
    ...input,
    systemClockOffset,
    signingEscapePath,
    credentials: normalizedCreds,
    signer
  };
};
var normalizeCredentialProvider = (credentials) => {
  if (typeof credentials === "function") {
    return memoize(credentials, (credentials2) => credentials2.expiration !== void 0 && credentials2.expiration.getTime() - Date.now() < CREDENTIAL_EXPIRE_WINDOW, (credentials2) => credentials2.expiration !== void 0);
  }
  return normalizeProvider(credentials);
};

// node_modules/@aws-sdk/middleware-signing/dist-es/utils/getSkewCorrectedDate.js
var getSkewCorrectedDate = (systemClockOffset) => new Date(Date.now() + systemClockOffset);

// node_modules/@aws-sdk/middleware-signing/dist-es/utils/isClockSkewed.js
var isClockSkewed = (clockTime, systemClockOffset) => Math.abs(getSkewCorrectedDate(systemClockOffset).getTime() - clockTime) >= 3e5;

// node_modules/@aws-sdk/middleware-signing/dist-es/utils/getUpdatedSystemClockOffset.js
var getUpdatedSystemClockOffset = (clockTime, currentSystemClockOffset) => {
  const clockTimeInMs = Date.parse(clockTime);
  if (isClockSkewed(clockTimeInMs, currentSystemClockOffset)) {
    return clockTimeInMs - Date.now();
  }
  return currentSystemClockOffset;
};

// node_modules/@aws-sdk/middleware-signing/dist-es/awsAuthMiddleware.js
var awsAuthMiddleware = (options) => (next, context) => async function(args) {
  if (!HttpRequest.isInstance(args.request))
    return next(args);
  let authScheme;
  let signer;
  const firstAuthScheme = context.endpointV2?.properties?.authSchemes?.[0];
  const secondAuthScheme = context.endpointV2?.properties?.authSchemes?.[1];
  const firstAuthSchemeIsSigv4a = firstAuthScheme?.name === "sigv4a";
  if (firstAuthSchemeIsSigv4a && secondAuthScheme) {
    signer = await options.signer(authScheme = firstAuthScheme);
    const uncheckedSigner = signer;
    const sigv4aAvailable = (() => {
      if (typeof uncheckedSigner?.getSigv4aSigner === "function") {
        if (uncheckedSigner?.signerOptions?.runtime !== "node") {
          return false;
        }
        try {
          uncheckedSigner.getSigv4aSigner();
          return true;
        } catch (e2) {
        }
      }
      return false;
    })();
    if (!sigv4aAvailable) {
      signer = await options.signer(authScheme = secondAuthScheme);
    }
  } else {
    signer = await options.signer(authScheme = firstAuthScheme);
  }
  let signedRequest;
  const multiRegionOverride = authScheme?.name === "sigv4a" ? authScheme?.signingRegionSet?.join(",") : void 0;
  const signingOptions = {
    signingDate: getSkewCorrectedDate(options.systemClockOffset),
    signingRegion: multiRegionOverride || context["signing_region"],
    signingService: context["signing_service"]
  };
  if (context.s3ExpressIdentity) {
    const sigV4MultiRegion = signer;
    signedRequest = await sigV4MultiRegion.signWithCredentials(args.request, context.s3ExpressIdentity, signingOptions);
    if (signedRequest.headers["X-Amz-Security-Token"] || signedRequest.headers["x-amz-security-token"]) {
      throw new Error("X-Amz-Security-Token must not be set for s3-express requests.");
    }
  } else {
    signedRequest = await signer.sign(args.request, signingOptions);
  }
  const output = await next({
    ...args,
    request: signedRequest
  }).catch((error) => {
    const serverTime = error.ServerTime ?? getDateHeader(error.$response);
    if (serverTime) {
      options.systemClockOffset = getUpdatedSystemClockOffset(serverTime, options.systemClockOffset);
    }
    throw error;
  });
  const dateHeader = getDateHeader(output.response);
  if (dateHeader) {
    options.systemClockOffset = getUpdatedSystemClockOffset(dateHeader, options.systemClockOffset);
  }
  return output;
};
var getDateHeader = (response) => HttpResponse.isInstance(response) ? response.headers?.date ?? response.headers?.Date : void 0;
var awsAuthMiddlewareOptions = {
  name: "awsAuthMiddleware",
  tags: ["SIGNATURE", "AWSAUTH"],
  relation: "after",
  toMiddleware: "retryMiddleware",
  override: true
};
var getAwsAuthPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.addRelativeTo(awsAuthMiddleware(options), awsAuthMiddlewareOptions);
  }
});

// node_modules/@aws-sdk/middleware-user-agent/dist-es/configurations.js
function resolveUserAgentConfig(input) {
  return {
    ...input,
    customUserAgent: typeof input.customUserAgent === "string" ? [[input.customUserAgent]] : input.customUserAgent
  };
}

// node_modules/@smithy/util-endpoints/dist-es/lib/isIpAddress.js
var IP_V4_REGEX = new RegExp(`^(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}$`);
var isIpAddress = (value) => IP_V4_REGEX.test(value) || value.startsWith("[") && value.endsWith("]");

// node_modules/@smithy/util-endpoints/dist-es/lib/isValidHostLabel.js
var VALID_HOST_LABEL_REGEX = new RegExp(`^(?!.*-$)(?!-)[a-zA-Z0-9-]{1,63}$`);
var isValidHostLabel = (value, allowSubDomains = false) => {
  if (!allowSubDomains) {
    return VALID_HOST_LABEL_REGEX.test(value);
  }
  const labels = value.split(".");
  for (const label of labels) {
    if (!isValidHostLabel(label)) {
      return false;
    }
  }
  return true;
};

// node_modules/@smithy/util-endpoints/dist-es/utils/customEndpointFunctions.js
var customEndpointFunctions = {};

// node_modules/@smithy/util-endpoints/dist-es/debug/debugId.js
var debugId = "endpoints";

// node_modules/@smithy/util-endpoints/dist-es/debug/toDebugString.js
function toDebugString(input) {
  if (typeof input !== "object" || input == null) {
    return input;
  }
  if ("ref" in input) {
    return `$${toDebugString(input.ref)}`;
  }
  if ("fn" in input) {
    return `${input.fn}(${(input.argv || []).map(toDebugString).join(", ")})`;
  }
  return JSON.stringify(input, null, 2);
}

// node_modules/@smithy/util-endpoints/dist-es/types/EndpointError.js
var EndpointError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "EndpointError";
  }
};

// node_modules/@smithy/util-endpoints/dist-es/lib/booleanEquals.js
var booleanEquals = (value1, value2) => value1 === value2;

// node_modules/@smithy/util-endpoints/dist-es/lib/getAttrPathList.js
var getAttrPathList = (path) => {
  const parts = path.split(".");
  const pathList = [];
  for (const part of parts) {
    const squareBracketIndex = part.indexOf("[");
    if (squareBracketIndex !== -1) {
      if (part.indexOf("]") !== part.length - 1) {
        throw new EndpointError(`Path: '${path}' does not end with ']'`);
      }
      const arrayIndex = part.slice(squareBracketIndex + 1, -1);
      if (Number.isNaN(parseInt(arrayIndex))) {
        throw new EndpointError(`Invalid array index: '${arrayIndex}' in path: '${path}'`);
      }
      if (squareBracketIndex !== 0) {
        pathList.push(part.slice(0, squareBracketIndex));
      }
      pathList.push(arrayIndex);
    } else {
      pathList.push(part);
    }
  }
  return pathList;
};

// node_modules/@smithy/util-endpoints/dist-es/lib/getAttr.js
var getAttr = (value, path) => getAttrPathList(path).reduce((acc, index) => {
  if (typeof acc !== "object") {
    throw new EndpointError(`Index '${index}' in '${path}' not found in '${JSON.stringify(value)}'`);
  } else if (Array.isArray(acc)) {
    return acc[parseInt(index)];
  }
  return acc[index];
}, value);

// node_modules/@smithy/util-endpoints/dist-es/lib/isSet.js
var isSet = (value) => value != null;

// node_modules/@smithy/util-endpoints/dist-es/lib/not.js
var not = (value) => !value;

// node_modules/@smithy/util-endpoints/dist-es/lib/parseURL.js
var DEFAULT_PORTS = {
  [EndpointURLScheme.HTTP]: 80,
  [EndpointURLScheme.HTTPS]: 443
};
var parseURL = (value) => {
  const whatwgURL = (() => {
    try {
      if (value instanceof URL) {
        return value;
      }
      if (typeof value === "object" && "hostname" in value) {
        const { hostname: hostname2, port, protocol: protocol2 = "", path = "", query = {} } = value;
        const url = new URL(`${protocol2}//${hostname2}${port ? `:${port}` : ""}${path}`);
        url.search = Object.entries(query).map(([k2, v2]) => `${k2}=${v2}`).join("&");
        return url;
      }
      return new URL(value);
    } catch (error) {
      return null;
    }
  })();
  if (!whatwgURL) {
    console.error(`Unable to parse ${JSON.stringify(value)} as a whatwg URL.`);
    return null;
  }
  const urlString = whatwgURL.href;
  const { host, hostname, pathname, protocol, search } = whatwgURL;
  if (search) {
    return null;
  }
  const scheme = protocol.slice(0, -1);
  if (!Object.values(EndpointURLScheme).includes(scheme)) {
    return null;
  }
  const isIp = isIpAddress(hostname);
  const inputContainsDefaultPort = urlString.includes(`${host}:${DEFAULT_PORTS[scheme]}`) || typeof value === "string" && value.includes(`${host}:${DEFAULT_PORTS[scheme]}`);
  const authority = `${host}${inputContainsDefaultPort ? `:${DEFAULT_PORTS[scheme]}` : ``}`;
  return {
    scheme,
    authority,
    path: pathname,
    normalizedPath: pathname.endsWith("/") ? pathname : `${pathname}/`,
    isIp
  };
};

// node_modules/@smithy/util-endpoints/dist-es/lib/stringEquals.js
var stringEquals = (value1, value2) => value1 === value2;

// node_modules/@smithy/util-endpoints/dist-es/lib/substring.js
var substring = (input, start, stop, reverse) => {
  if (start >= stop || input.length < stop) {
    return null;
  }
  if (!reverse) {
    return input.substring(start, stop);
  }
  return input.substring(input.length - stop, input.length - start);
};

// node_modules/@smithy/util-endpoints/dist-es/lib/uriEncode.js
var uriEncode = (value) => encodeURIComponent(value).replace(/[!*'()]/g, (c2) => `%${c2.charCodeAt(0).toString(16).toUpperCase()}`);

// node_modules/@smithy/util-endpoints/dist-es/utils/endpointFunctions.js
var endpointFunctions = {
  booleanEquals,
  getAttr,
  isSet,
  isValidHostLabel,
  not,
  parseURL,
  stringEquals,
  substring,
  uriEncode
};

// node_modules/@smithy/util-endpoints/dist-es/utils/evaluateTemplate.js
var evaluateTemplate = (template, options) => {
  const evaluatedTemplateArr = [];
  const templateContext = {
    ...options.endpointParams,
    ...options.referenceRecord
  };
  let currentIndex = 0;
  while (currentIndex < template.length) {
    const openingBraceIndex = template.indexOf("{", currentIndex);
    if (openingBraceIndex === -1) {
      evaluatedTemplateArr.push(template.slice(currentIndex));
      break;
    }
    evaluatedTemplateArr.push(template.slice(currentIndex, openingBraceIndex));
    const closingBraceIndex = template.indexOf("}", openingBraceIndex);
    if (closingBraceIndex === -1) {
      evaluatedTemplateArr.push(template.slice(openingBraceIndex));
      break;
    }
    if (template[openingBraceIndex + 1] === "{" && template[closingBraceIndex + 1] === "}") {
      evaluatedTemplateArr.push(template.slice(openingBraceIndex + 1, closingBraceIndex));
      currentIndex = closingBraceIndex + 2;
    }
    const parameterName = template.substring(openingBraceIndex + 1, closingBraceIndex);
    if (parameterName.includes("#")) {
      const [refName, attrName] = parameterName.split("#");
      evaluatedTemplateArr.push(getAttr(templateContext[refName], attrName));
    } else {
      evaluatedTemplateArr.push(templateContext[parameterName]);
    }
    currentIndex = closingBraceIndex + 1;
  }
  return evaluatedTemplateArr.join("");
};

// node_modules/@smithy/util-endpoints/dist-es/utils/getReferenceValue.js
var getReferenceValue = ({ ref }, options) => {
  const referenceRecord = {
    ...options.endpointParams,
    ...options.referenceRecord
  };
  return referenceRecord[ref];
};

// node_modules/@smithy/util-endpoints/dist-es/utils/evaluateExpression.js
var evaluateExpression = (obj, keyName, options) => {
  if (typeof obj === "string") {
    return evaluateTemplate(obj, options);
  } else if (obj["fn"]) {
    return callFunction(obj, options);
  } else if (obj["ref"]) {
    return getReferenceValue(obj, options);
  }
  throw new EndpointError(`'${keyName}': ${String(obj)} is not a string, function or reference.`);
};

// node_modules/@smithy/util-endpoints/dist-es/utils/callFunction.js
var callFunction = ({ fn, argv }, options) => {
  const evaluatedArgs = argv.map((arg) => ["boolean", "number"].includes(typeof arg) ? arg : evaluateExpression(arg, "arg", options));
  const fnSegments = fn.split(".");
  if (fnSegments[0] in customEndpointFunctions && fnSegments[1] != null) {
    return customEndpointFunctions[fnSegments[0]][fnSegments[1]](...evaluatedArgs);
  }
  return endpointFunctions[fn](...evaluatedArgs);
};

// node_modules/@smithy/util-endpoints/dist-es/utils/evaluateCondition.js
var evaluateCondition = ({ assign, ...fnArgs }, options) => {
  if (assign && assign in options.referenceRecord) {
    throw new EndpointError(`'${assign}' is already defined in Reference Record.`);
  }
  const value = callFunction(fnArgs, options);
  options.logger?.debug?.(debugId, `evaluateCondition: ${toDebugString(fnArgs)} = ${toDebugString(value)}`);
  return {
    result: value === "" ? true : !!value,
    ...assign != null && { toAssign: { name: assign, value } }
  };
};

// node_modules/@smithy/util-endpoints/dist-es/utils/evaluateConditions.js
var evaluateConditions = (conditions = [], options) => {
  const conditionsReferenceRecord = {};
  for (const condition of conditions) {
    const { result, toAssign } = evaluateCondition(condition, {
      ...options,
      referenceRecord: {
        ...options.referenceRecord,
        ...conditionsReferenceRecord
      }
    });
    if (!result) {
      return { result };
    }
    if (toAssign) {
      conditionsReferenceRecord[toAssign.name] = toAssign.value;
      options.logger?.debug?.(debugId, `assign: ${toAssign.name} := ${toDebugString(toAssign.value)}`);
    }
  }
  return { result: true, referenceRecord: conditionsReferenceRecord };
};

// node_modules/@smithy/util-endpoints/dist-es/utils/getEndpointHeaders.js
var getEndpointHeaders = (headers, options) => Object.entries(headers).reduce((acc, [headerKey, headerVal]) => ({
  ...acc,
  [headerKey]: headerVal.map((headerValEntry) => {
    const processedExpr = evaluateExpression(headerValEntry, "Header value entry", options);
    if (typeof processedExpr !== "string") {
      throw new EndpointError(`Header '${headerKey}' value '${processedExpr}' is not a string`);
    }
    return processedExpr;
  })
}), {});

// node_modules/@smithy/util-endpoints/dist-es/utils/getEndpointProperty.js
var getEndpointProperty = (property, options) => {
  if (Array.isArray(property)) {
    return property.map((propertyEntry) => getEndpointProperty(propertyEntry, options));
  }
  switch (typeof property) {
    case "string":
      return evaluateTemplate(property, options);
    case "object":
      if (property === null) {
        throw new EndpointError(`Unexpected endpoint property: ${property}`);
      }
      return getEndpointProperties(property, options);
    case "boolean":
      return property;
    default:
      throw new EndpointError(`Unexpected endpoint property type: ${typeof property}`);
  }
};

// node_modules/@smithy/util-endpoints/dist-es/utils/getEndpointProperties.js
var getEndpointProperties = (properties, options) => Object.entries(properties).reduce((acc, [propertyKey, propertyVal]) => ({
  ...acc,
  [propertyKey]: getEndpointProperty(propertyVal, options)
}), {});

// node_modules/@smithy/util-endpoints/dist-es/utils/getEndpointUrl.js
var getEndpointUrl = (endpointUrl, options) => {
  const expression = evaluateExpression(endpointUrl, "Endpoint URL", options);
  if (typeof expression === "string") {
    try {
      return new URL(expression);
    } catch (error) {
      console.error(`Failed to construct URL with ${expression}`, error);
      throw error;
    }
  }
  throw new EndpointError(`Endpoint URL must be a string, got ${typeof expression}`);
};

// node_modules/@smithy/util-endpoints/dist-es/utils/evaluateEndpointRule.js
var evaluateEndpointRule = (endpointRule, options) => {
  const { conditions, endpoint } = endpointRule;
  const { result, referenceRecord } = evaluateConditions(conditions, options);
  if (!result) {
    return;
  }
  const endpointRuleOptions = {
    ...options,
    referenceRecord: { ...options.referenceRecord, ...referenceRecord }
  };
  const { url, properties, headers } = endpoint;
  options.logger?.debug?.(debugId, `Resolving endpoint from template: ${toDebugString(endpoint)}`);
  return {
    ...headers != void 0 && {
      headers: getEndpointHeaders(headers, endpointRuleOptions)
    },
    ...properties != void 0 && {
      properties: getEndpointProperties(properties, endpointRuleOptions)
    },
    url: getEndpointUrl(url, endpointRuleOptions)
  };
};

// node_modules/@smithy/util-endpoints/dist-es/utils/evaluateErrorRule.js
var evaluateErrorRule = (errorRule, options) => {
  const { conditions, error } = errorRule;
  const { result, referenceRecord } = evaluateConditions(conditions, options);
  if (!result) {
    return;
  }
  throw new EndpointError(evaluateExpression(error, "Error", {
    ...options,
    referenceRecord: { ...options.referenceRecord, ...referenceRecord }
  }));
};

// node_modules/@smithy/util-endpoints/dist-es/utils/evaluateTreeRule.js
var evaluateTreeRule = (treeRule, options) => {
  const { conditions, rules } = treeRule;
  const { result, referenceRecord } = evaluateConditions(conditions, options);
  if (!result) {
    return;
  }
  return evaluateRules(rules, {
    ...options,
    referenceRecord: { ...options.referenceRecord, ...referenceRecord }
  });
};

// node_modules/@smithy/util-endpoints/dist-es/utils/evaluateRules.js
var evaluateRules = (rules, options) => {
  for (const rule of rules) {
    if (rule.type === "endpoint") {
      const endpointOrUndefined = evaluateEndpointRule(rule, options);
      if (endpointOrUndefined) {
        return endpointOrUndefined;
      }
    } else if (rule.type === "error") {
      evaluateErrorRule(rule, options);
    } else if (rule.type === "tree") {
      const endpointOrUndefined = evaluateTreeRule(rule, options);
      if (endpointOrUndefined) {
        return endpointOrUndefined;
      }
    } else {
      throw new EndpointError(`Unknown endpoint rule: ${rule}`);
    }
  }
  throw new EndpointError(`Rules evaluation failed`);
};

// node_modules/@smithy/util-endpoints/dist-es/resolveEndpoint.js
var resolveEndpoint = (ruleSetObject, options) => {
  const { endpointParams, logger: logger2 } = options;
  const { parameters, rules } = ruleSetObject;
  options.logger?.debug?.(`${debugId} Initial EndpointParams: ${toDebugString(endpointParams)}`);
  const paramsWithDefault = Object.entries(parameters).filter(([, v2]) => v2.default != null).map(([k2, v2]) => [k2, v2.default]);
  if (paramsWithDefault.length > 0) {
    for (const [paramKey, paramDefaultValue] of paramsWithDefault) {
      endpointParams[paramKey] = endpointParams[paramKey] ?? paramDefaultValue;
    }
  }
  const requiredParams = Object.entries(parameters).filter(([, v2]) => v2.required).map(([k2]) => k2);
  for (const requiredParam of requiredParams) {
    if (endpointParams[requiredParam] == null) {
      throw new EndpointError(`Missing required parameter: '${requiredParam}'`);
    }
  }
  const endpoint = evaluateRules(rules, { endpointParams, logger: logger2, referenceRecord: {} });
  if (options.endpointParams?.Endpoint) {
    try {
      const givenEndpoint = new URL(options.endpointParams.Endpoint);
      const { protocol, port } = givenEndpoint;
      endpoint.url.protocol = protocol;
      endpoint.url.port = port;
    } catch (e2) {
    }
  }
  options.logger?.debug?.(`${debugId} Resolved endpoint: ${toDebugString(endpoint)}`);
  return endpoint;
};

// node_modules/@aws-sdk/util-endpoints/dist-es/lib/aws/isVirtualHostableS3Bucket.js
var isVirtualHostableS3Bucket = (value, allowSubDomains = false) => {
  if (allowSubDomains) {
    for (const label of value.split(".")) {
      if (!isVirtualHostableS3Bucket(label)) {
        return false;
      }
    }
    return true;
  }
  if (!isValidHostLabel(value)) {
    return false;
  }
  if (value.length < 3 || value.length > 63) {
    return false;
  }
  if (value !== value.toLowerCase()) {
    return false;
  }
  if (isIpAddress(value)) {
    return false;
  }
  return true;
};

// node_modules/@aws-sdk/util-endpoints/dist-es/lib/aws/parseArn.js
var parseArn = (value) => {
  const segments = value.split(":");
  if (segments.length < 6)
    return null;
  const [arn, partition2, service, region, accountId, ...resourceId] = segments;
  if (arn !== "arn" || partition2 === "" || service === "" || resourceId[0] === "")
    return null;
  return {
    partition: partition2,
    service,
    region,
    accountId,
    resourceId: resourceId[0].includes("/") ? resourceId[0].split("/") : resourceId
  };
};

// node_modules/@aws-sdk/util-endpoints/dist-es/lib/aws/partitions.json
var partitions_default = {
  partitions: [{
    id: "aws",
    outputs: {
      dnsSuffix: "amazonaws.com",
      dualStackDnsSuffix: "api.aws",
      implicitGlobalRegion: "us-east-1",
      name: "aws",
      supportsDualStack: true,
      supportsFIPS: true
    },
    regionRegex: "^(us|eu|ap|sa|ca|me|af|il)\\-\\w+\\-\\d+$",
    regions: {
      "af-south-1": {
        description: "Africa (Cape Town)"
      },
      "ap-east-1": {
        description: "Asia Pacific (Hong Kong)"
      },
      "ap-northeast-1": {
        description: "Asia Pacific (Tokyo)"
      },
      "ap-northeast-2": {
        description: "Asia Pacific (Seoul)"
      },
      "ap-northeast-3": {
        description: "Asia Pacific (Osaka)"
      },
      "ap-south-1": {
        description: "Asia Pacific (Mumbai)"
      },
      "ap-south-2": {
        description: "Asia Pacific (Hyderabad)"
      },
      "ap-southeast-1": {
        description: "Asia Pacific (Singapore)"
      },
      "ap-southeast-2": {
        description: "Asia Pacific (Sydney)"
      },
      "ap-southeast-3": {
        description: "Asia Pacific (Jakarta)"
      },
      "ap-southeast-4": {
        description: "Asia Pacific (Melbourne)"
      },
      "aws-global": {
        description: "AWS Standard global region"
      },
      "ca-central-1": {
        description: "Canada (Central)"
      },
      "ca-west-1": {
        description: "Canada West (Calgary)"
      },
      "eu-central-1": {
        description: "Europe (Frankfurt)"
      },
      "eu-central-2": {
        description: "Europe (Zurich)"
      },
      "eu-north-1": {
        description: "Europe (Stockholm)"
      },
      "eu-south-1": {
        description: "Europe (Milan)"
      },
      "eu-south-2": {
        description: "Europe (Spain)"
      },
      "eu-west-1": {
        description: "Europe (Ireland)"
      },
      "eu-west-2": {
        description: "Europe (London)"
      },
      "eu-west-3": {
        description: "Europe (Paris)"
      },
      "il-central-1": {
        description: "Israel (Tel Aviv)"
      },
      "me-central-1": {
        description: "Middle East (UAE)"
      },
      "me-south-1": {
        description: "Middle East (Bahrain)"
      },
      "sa-east-1": {
        description: "South America (Sao Paulo)"
      },
      "us-east-1": {
        description: "US East (N. Virginia)"
      },
      "us-east-2": {
        description: "US East (Ohio)"
      },
      "us-west-1": {
        description: "US West (N. California)"
      },
      "us-west-2": {
        description: "US West (Oregon)"
      }
    }
  }, {
    id: "aws-cn",
    outputs: {
      dnsSuffix: "amazonaws.com.cn",
      dualStackDnsSuffix: "api.amazonwebservices.com.cn",
      implicitGlobalRegion: "cn-northwest-1",
      name: "aws-cn",
      supportsDualStack: true,
      supportsFIPS: true
    },
    regionRegex: "^cn\\-\\w+\\-\\d+$",
    regions: {
      "aws-cn-global": {
        description: "AWS China global region"
      },
      "cn-north-1": {
        description: "China (Beijing)"
      },
      "cn-northwest-1": {
        description: "China (Ningxia)"
      }
    }
  }, {
    id: "aws-us-gov",
    outputs: {
      dnsSuffix: "amazonaws.com",
      dualStackDnsSuffix: "api.aws",
      implicitGlobalRegion: "us-gov-west-1",
      name: "aws-us-gov",
      supportsDualStack: true,
      supportsFIPS: true
    },
    regionRegex: "^us\\-gov\\-\\w+\\-\\d+$",
    regions: {
      "aws-us-gov-global": {
        description: "AWS GovCloud (US) global region"
      },
      "us-gov-east-1": {
        description: "AWS GovCloud (US-East)"
      },
      "us-gov-west-1": {
        description: "AWS GovCloud (US-West)"
      }
    }
  }, {
    id: "aws-iso",
    outputs: {
      dnsSuffix: "c2s.ic.gov",
      dualStackDnsSuffix: "c2s.ic.gov",
      implicitGlobalRegion: "us-iso-east-1",
      name: "aws-iso",
      supportsDualStack: false,
      supportsFIPS: true
    },
    regionRegex: "^us\\-iso\\-\\w+\\-\\d+$",
    regions: {
      "aws-iso-global": {
        description: "AWS ISO (US) global region"
      },
      "us-iso-east-1": {
        description: "US ISO East"
      },
      "us-iso-west-1": {
        description: "US ISO WEST"
      }
    }
  }, {
    id: "aws-iso-b",
    outputs: {
      dnsSuffix: "sc2s.sgov.gov",
      dualStackDnsSuffix: "sc2s.sgov.gov",
      implicitGlobalRegion: "us-isob-east-1",
      name: "aws-iso-b",
      supportsDualStack: false,
      supportsFIPS: true
    },
    regionRegex: "^us\\-isob\\-\\w+\\-\\d+$",
    regions: {
      "aws-iso-b-global": {
        description: "AWS ISOB (US) global region"
      },
      "us-isob-east-1": {
        description: "US ISOB East (Ohio)"
      }
    }
  }, {
    id: "aws-iso-e",
    outputs: {
      dnsSuffix: "cloud.adc-e.uk",
      dualStackDnsSuffix: "cloud.adc-e.uk",
      implicitGlobalRegion: "eu-isoe-west-1",
      name: "aws-iso-e",
      supportsDualStack: false,
      supportsFIPS: true
    },
    regionRegex: "^eu\\-isoe\\-\\w+\\-\\d+$",
    regions: {}
  }, {
    id: "aws-iso-f",
    outputs: {
      dnsSuffix: "csp.hci.ic.gov",
      dualStackDnsSuffix: "csp.hci.ic.gov",
      implicitGlobalRegion: "us-isof-south-1",
      name: "aws-iso-f",
      supportsDualStack: false,
      supportsFIPS: true
    },
    regionRegex: "^us\\-isof\\-\\w+\\-\\d+$",
    regions: {}
  }],
  version: "1.1"
};

// node_modules/@aws-sdk/util-endpoints/dist-es/lib/aws/partition.js
var selectedPartitionsInfo = partitions_default;
var selectedUserAgentPrefix = "";
var partition = (value) => {
  const { partitions } = selectedPartitionsInfo;
  for (const partition2 of partitions) {
    const { regions, outputs } = partition2;
    for (const [region, regionData] of Object.entries(regions)) {
      if (region === value) {
        return {
          ...outputs,
          ...regionData
        };
      }
    }
  }
  for (const partition2 of partitions) {
    const { regionRegex, outputs } = partition2;
    if (new RegExp(regionRegex).test(value)) {
      return {
        ...outputs
      };
    }
  }
  const DEFAULT_PARTITION = partitions.find((partition2) => partition2.id === "aws");
  if (!DEFAULT_PARTITION) {
    throw new Error("Provided region was not found in the partition array or regex, and default partition with id 'aws' doesn't exist.");
  }
  return {
    ...DEFAULT_PARTITION.outputs
  };
};
var getUserAgentPrefix = () => selectedUserAgentPrefix;

// node_modules/@aws-sdk/util-endpoints/dist-es/aws.js
var awsEndpointFunctions = {
  isVirtualHostableS3Bucket,
  parseArn,
  partition
};
customEndpointFunctions.aws = awsEndpointFunctions;

// node_modules/@aws-sdk/middleware-user-agent/dist-es/constants.js
var USER_AGENT = "user-agent";
var X_AMZ_USER_AGENT = "x-amz-user-agent";
var SPACE = " ";
var UA_NAME_SEPARATOR = "/";
var UA_NAME_ESCAPE_REGEX = /[^\!\$\%\&\'\*\+\-\.\^\_\`\|\~\d\w]/g;
var UA_VALUE_ESCAPE_REGEX = /[^\!\$\%\&\'\*\+\-\.\^\_\`\|\~\d\w\#]/g;
var UA_ESCAPE_CHAR = "-";

// node_modules/@aws-sdk/middleware-user-agent/dist-es/user-agent-middleware.js
var userAgentMiddleware = (options) => (next, context) => async (args) => {
  const { request } = args;
  if (!HttpRequest.isInstance(request))
    return next(args);
  const { headers } = request;
  const userAgent = context?.userAgent?.map(escapeUserAgent) || [];
  const defaultUserAgent2 = (await options.defaultUserAgentProvider()).map(escapeUserAgent);
  const customUserAgent = options?.customUserAgent?.map(escapeUserAgent) || [];
  const prefix = getUserAgentPrefix();
  const sdkUserAgentValue = (prefix ? [prefix] : []).concat([...defaultUserAgent2, ...userAgent, ...customUserAgent]).join(SPACE);
  const normalUAValue = [
    ...defaultUserAgent2.filter((section) => section.startsWith("aws-sdk-")),
    ...customUserAgent
  ].join(SPACE);
  if (options.runtime !== "browser") {
    if (normalUAValue) {
      headers[X_AMZ_USER_AGENT] = headers[X_AMZ_USER_AGENT] ? `${headers[USER_AGENT]} ${normalUAValue}` : normalUAValue;
    }
    headers[USER_AGENT] = sdkUserAgentValue;
  } else {
    headers[X_AMZ_USER_AGENT] = sdkUserAgentValue;
  }
  return next({
    ...args,
    request
  });
};
var escapeUserAgent = (userAgentPair) => {
  const name = userAgentPair[0].split(UA_NAME_SEPARATOR).map((part) => part.replace(UA_NAME_ESCAPE_REGEX, UA_ESCAPE_CHAR)).join(UA_NAME_SEPARATOR);
  const version = userAgentPair[1]?.replace(UA_VALUE_ESCAPE_REGEX, UA_ESCAPE_CHAR);
  const prefixSeparatorIndex = name.indexOf(UA_NAME_SEPARATOR);
  const prefix = name.substring(0, prefixSeparatorIndex);
  let uaName = name.substring(prefixSeparatorIndex + 1);
  if (prefix === "api") {
    uaName = uaName.toLowerCase();
  }
  return [prefix, uaName, version].filter((item) => item && item.length > 0).reduce((acc, item, index) => {
    switch (index) {
      case 0:
        return item;
      case 1:
        return `${acc}/${item}`;
      default:
        return `${acc}#${item}`;
    }
  }, "");
};
var getUserAgentMiddlewareOptions = {
  name: "getUserAgentMiddleware",
  step: "build",
  priority: "low",
  tags: ["SET_USER_AGENT", "USER_AGENT"],
  override: true
};
var getUserAgentPlugin = (config) => ({
  applyToStack: (clientStack) => {
    clientStack.add(userAgentMiddleware(config), getUserAgentMiddlewareOptions);
  }
});

// node_modules/@smithy/config-resolver/dist-es/endpointsConfig/NodeUseDualstackEndpointConfigOptions.js
var DEFAULT_USE_DUALSTACK_ENDPOINT = false;

// node_modules/@smithy/config-resolver/dist-es/endpointsConfig/NodeUseFipsEndpointConfigOptions.js
var DEFAULT_USE_FIPS_ENDPOINT = false;

// node_modules/@smithy/config-resolver/dist-es/regionConfig/isFipsRegion.js
var isFipsRegion = (region) => typeof region === "string" && (region.startsWith("fips-") || region.endsWith("-fips"));

// node_modules/@smithy/config-resolver/dist-es/regionConfig/getRealRegion.js
var getRealRegion = (region) => isFipsRegion(region) ? ["fips-aws-global", "aws-fips"].includes(region) ? "us-east-1" : region.replace(/fips-(dkr-|prod-)?|-fips/, "") : region;

// node_modules/@smithy/config-resolver/dist-es/regionConfig/resolveRegionConfig.js
var resolveRegionConfig = (input) => {
  const { region, useFipsEndpoint } = input;
  if (!region) {
    throw new Error("Region is missing");
  }
  return {
    ...input,
    region: async () => {
      if (typeof region === "string") {
        return getRealRegion(region);
      }
      const providedRegion = await region();
      return getRealRegion(providedRegion);
    },
    useFipsEndpoint: async () => {
      const providedRegion = typeof region === "string" ? region : await region();
      if (isFipsRegion(providedRegion)) {
        return true;
      }
      return typeof useFipsEndpoint !== "function" ? Promise.resolve(!!useFipsEndpoint) : useFipsEndpoint();
    }
  };
};

// node_modules/@smithy/eventstream-serde-config-resolver/dist-es/EventStreamSerdeConfig.js
var resolveEventStreamSerdeConfig = (input) => ({
  ...input,
  eventStreamMarshaller: input.eventStreamSerdeProvider(input)
});

// node_modules/@smithy/middleware-content-length/dist-es/index.js
var CONTENT_LENGTH_HEADER2 = "content-length";
function contentLengthMiddleware(bodyLengthChecker) {
  return (next) => async (args) => {
    const request = args.request;
    if (HttpRequest.isInstance(request)) {
      const { body, headers } = request;
      if (body && Object.keys(headers).map((str) => str.toLowerCase()).indexOf(CONTENT_LENGTH_HEADER2) === -1) {
        try {
          const length = bodyLengthChecker(body);
          request.headers = {
            ...request.headers,
            [CONTENT_LENGTH_HEADER2]: String(length)
          };
        } catch (error) {
        }
      }
    }
    return next({
      ...args,
      request
    });
  };
}
var contentLengthMiddlewareOptions = {
  step: "build",
  tags: ["SET_CONTENT_LENGTH", "CONTENT_LENGTH"],
  name: "contentLengthMiddleware",
  override: true
};
var getContentLengthPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(contentLengthMiddleware(options.bodyLengthChecker), contentLengthMiddlewareOptions);
  }
});

// node_modules/@smithy/middleware-endpoint/dist-es/service-customizations/s3.js
var resolveParamsForS3 = async (endpointParams) => {
  const bucket = endpointParams?.Bucket || "";
  if (typeof endpointParams.Bucket === "string") {
    endpointParams.Bucket = bucket.replace(/#/g, encodeURIComponent("#")).replace(/\?/g, encodeURIComponent("?"));
  }
  if (isArnBucketName(bucket)) {
    if (endpointParams.ForcePathStyle === true) {
      throw new Error("Path-style addressing cannot be used with ARN buckets");
    }
  } else if (!isDnsCompatibleBucketName(bucket) || bucket.indexOf(".") !== -1 && !String(endpointParams.Endpoint).startsWith("http:") || bucket.toLowerCase() !== bucket || bucket.length < 3) {
    endpointParams.ForcePathStyle = true;
  }
  if (endpointParams.DisableMultiRegionAccessPoints) {
    endpointParams.disableMultiRegionAccessPoints = true;
    endpointParams.DisableMRAP = true;
  }
  return endpointParams;
};
var DOMAIN_PATTERN = /^[a-z0-9][a-z0-9\.\-]{1,61}[a-z0-9]$/;
var IP_ADDRESS_PATTERN = /(\d+\.){3}\d+/;
var DOTS_PATTERN = /\.\./;
var isDnsCompatibleBucketName = (bucketName) => DOMAIN_PATTERN.test(bucketName) && !IP_ADDRESS_PATTERN.test(bucketName) && !DOTS_PATTERN.test(bucketName);
var isArnBucketName = (bucketName) => {
  const [arn, partition2, service, , , bucket] = bucketName.split(":");
  const isArn = arn === "arn" && bucketName.split(":").length >= 6;
  const isValidArn = Boolean(isArn && partition2 && service && bucket);
  if (isArn && !isValidArn) {
    throw new Error(`Invalid ARN: ${bucketName} was an invalid ARN.`);
  }
  return isValidArn;
};

// node_modules/@smithy/middleware-endpoint/dist-es/adaptors/createConfigValueProvider.js
var createConfigValueProvider = (configKey, canonicalEndpointParamKey, config) => {
  const configProvider = async () => {
    const configValue = config[configKey] ?? config[canonicalEndpointParamKey];
    if (typeof configValue === "function") {
      return configValue();
    }
    return configValue;
  };
  if (configKey === "credentialScope" || canonicalEndpointParamKey === "CredentialScope") {
    return async () => {
      const credentials = typeof config.credentials === "function" ? await config.credentials() : config.credentials;
      const configValue = credentials?.credentialScope ?? credentials?.CredentialScope;
      return configValue;
    };
  }
  if (configKey === "endpoint" || canonicalEndpointParamKey === "endpoint") {
    return async () => {
      const endpoint = await configProvider();
      if (endpoint && typeof endpoint === "object") {
        if ("url" in endpoint) {
          return endpoint.url.href;
        }
        if ("hostname" in endpoint) {
          const { protocol, hostname, port, path } = endpoint;
          return `${protocol}//${hostname}${port ? ":" + port : ""}${path}`;
        }
      }
      return endpoint;
    };
  }
  return configProvider;
};

// node_modules/@smithy/middleware-endpoint/dist-es/adaptors/getEndpointFromConfig.browser.js
var getEndpointFromConfig = async (serviceId) => void 0;

// node_modules/@smithy/querystring-parser/dist-es/index.js
function parseQueryString(querystring) {
  const query = {};
  querystring = querystring.replace(/^\?/, "");
  if (querystring) {
    for (const pair of querystring.split("&")) {
      let [key, value = null] = pair.split("=");
      key = decodeURIComponent(key);
      if (value) {
        value = decodeURIComponent(value);
      }
      if (!(key in query)) {
        query[key] = value;
      } else if (Array.isArray(query[key])) {
        query[key].push(value);
      } else {
        query[key] = [query[key], value];
      }
    }
  }
  return query;
}

// node_modules/@smithy/url-parser/dist-es/index.js
var parseUrl = (url) => {
  if (typeof url === "string") {
    return parseUrl(new URL(url));
  }
  const { hostname, pathname, port, protocol, search } = url;
  let query;
  if (search) {
    query = parseQueryString(search);
  }
  return {
    hostname,
    port: port ? parseInt(port) : void 0,
    protocol,
    path: pathname,
    query
  };
};

// node_modules/@smithy/middleware-endpoint/dist-es/adaptors/toEndpointV1.js
var toEndpointV1 = (endpoint) => {
  if (typeof endpoint === "object") {
    if ("url" in endpoint) {
      return parseUrl(endpoint.url);
    }
    return endpoint;
  }
  return parseUrl(endpoint);
};

// node_modules/@smithy/middleware-endpoint/dist-es/adaptors/getEndpointFromInstructions.js
var getEndpointFromInstructions = async (commandInput, instructionsSupplier, clientConfig, context) => {
  if (!clientConfig.endpoint) {
    const endpointFromConfig = await getEndpointFromConfig(clientConfig.serviceId || "");
    if (endpointFromConfig) {
      clientConfig.endpoint = () => Promise.resolve(toEndpointV1(endpointFromConfig));
    }
  }
  const endpointParams = await resolveParams(commandInput, instructionsSupplier, clientConfig);
  if (typeof clientConfig.endpointProvider !== "function") {
    throw new Error("config.endpointProvider is not set.");
  }
  const endpoint = clientConfig.endpointProvider(endpointParams, context);
  return endpoint;
};
var resolveParams = async (commandInput, instructionsSupplier, clientConfig) => {
  const endpointParams = {};
  const instructions = instructionsSupplier?.getEndpointParameterInstructions?.() || {};
  for (const [name, instruction] of Object.entries(instructions)) {
    switch (instruction.type) {
      case "staticContextParams":
        endpointParams[name] = instruction.value;
        break;
      case "contextParams":
        endpointParams[name] = commandInput[instruction.name];
        break;
      case "clientContextParams":
      case "builtInParams":
        endpointParams[name] = await createConfigValueProvider(instruction.name, name, clientConfig)();
        break;
      default:
        throw new Error("Unrecognized endpoint parameter instruction: " + JSON.stringify(instruction));
    }
  }
  if (Object.keys(instructions).length === 0) {
    Object.assign(endpointParams, clientConfig);
  }
  if (String(clientConfig.serviceId).toLowerCase() === "s3") {
    await resolveParamsForS3(endpointParams);
  }
  return endpointParams;
};

// node_modules/@smithy/middleware-endpoint/dist-es/endpointMiddleware.js
var endpointMiddleware = ({ config, instructions }) => {
  return (next, context) => async (args) => {
    const endpoint = await getEndpointFromInstructions(args.input, {
      getEndpointParameterInstructions() {
        return instructions;
      }
    }, { ...config }, context);
    context.endpointV2 = endpoint;
    context.authSchemes = endpoint.properties?.authSchemes;
    const authScheme = context.authSchemes?.[0];
    if (authScheme) {
      context["signing_region"] = authScheme.signingRegion;
      context["signing_service"] = authScheme.signingName;
      const smithyContext = getSmithyContext(context);
      const httpAuthOption = smithyContext?.selectedHttpAuthScheme?.httpAuthOption;
      if (httpAuthOption) {
        httpAuthOption.signingProperties = Object.assign(httpAuthOption.signingProperties || {}, {
          signing_region: authScheme.signingRegion,
          signingRegion: authScheme.signingRegion,
          signing_service: authScheme.signingName,
          signingName: authScheme.signingName,
          signingRegionSet: authScheme.signingRegionSet
        }, authScheme.properties);
      }
    }
    return next({
      ...args
    });
  };
};

// node_modules/@smithy/middleware-serde/dist-es/deserializerMiddleware.js
var deserializerMiddleware = (options, deserializer) => (next, context) => async (args) => {
  const { response } = await next(args);
  try {
    const parsed = await deserializer(response, options);
    return {
      response,
      output: parsed
    };
  } catch (error) {
    Object.defineProperty(error, "$response", {
      value: response
    });
    if (!("$metadata" in error)) {
      const hint = `Deserialization error: to see the raw response, inspect the hidden field {error}.$response on this object.`;
      error.message += "\n  " + hint;
      if (typeof error.$responseBodyText !== "undefined") {
        if (error.$response) {
          error.$response.body = error.$responseBodyText;
        }
      }
    }
    throw error;
  }
};

// node_modules/@smithy/middleware-serde/dist-es/serializerMiddleware.js
var serializerMiddleware = (options, serializer) => (next, context) => async (args) => {
  const endpoint = context.endpointV2?.url && options.urlParser ? async () => options.urlParser(context.endpointV2.url) : options.endpoint;
  if (!endpoint) {
    throw new Error("No valid endpoint provider available.");
  }
  const request = await serializer(args.input, { ...options, endpoint });
  return next({
    ...args,
    request
  });
};

// node_modules/@smithy/middleware-serde/dist-es/serdePlugin.js
var deserializerMiddlewareOption = {
  name: "deserializerMiddleware",
  step: "deserialize",
  tags: ["DESERIALIZER"],
  override: true
};
var serializerMiddlewareOption = {
  name: "serializerMiddleware",
  step: "serialize",
  tags: ["SERIALIZER"],
  override: true
};
function getSerdePlugin(config, serializer, deserializer) {
  return {
    applyToStack: (commandStack) => {
      commandStack.add(deserializerMiddleware(config, deserializer), deserializerMiddlewareOption);
      commandStack.add(serializerMiddleware(config, serializer), serializerMiddlewareOption);
    }
  };
}

// node_modules/@smithy/middleware-endpoint/dist-es/getEndpointPlugin.js
var endpointMiddlewareOptions = {
  step: "serialize",
  tags: ["ENDPOINT_PARAMETERS", "ENDPOINT_V2", "ENDPOINT"],
  name: "endpointV2Middleware",
  override: true,
  relation: "before",
  toMiddleware: serializerMiddlewareOption.name
};
var getEndpointPlugin = (config, instructions) => ({
  applyToStack: (clientStack) => {
    clientStack.addRelativeTo(endpointMiddleware({
      config,
      instructions
    }), endpointMiddlewareOptions);
  }
});

// node_modules/@smithy/middleware-endpoint/dist-es/resolveEndpointConfig.js
var resolveEndpointConfig = (input) => {
  const tls = input.tls ?? true;
  const { endpoint } = input;
  const customEndpointProvider = endpoint != null ? async () => toEndpointV1(await normalizeProvider(endpoint)()) : void 0;
  const isCustomEndpoint = !!endpoint;
  return {
    ...input,
    endpoint: customEndpointProvider,
    tls,
    isCustomEndpoint,
    useDualstackEndpoint: normalizeProvider(input.useDualstackEndpoint ?? false),
    useFipsEndpoint: normalizeProvider(input.useFipsEndpoint ?? false)
  };
};

// node_modules/@smithy/util-retry/dist-es/config.js
var RETRY_MODES;
(function(RETRY_MODES2) {
  RETRY_MODES2["STANDARD"] = "standard";
  RETRY_MODES2["ADAPTIVE"] = "adaptive";
})(RETRY_MODES || (RETRY_MODES = {}));
var DEFAULT_MAX_ATTEMPTS = 3;
var DEFAULT_RETRY_MODE = RETRY_MODES.STANDARD;

// node_modules/@smithy/service-error-classification/dist-es/constants.js
var THROTTLING_ERROR_CODES = [
  "BandwidthLimitExceeded",
  "EC2ThrottledException",
  "LimitExceededException",
  "PriorRequestNotComplete",
  "ProvisionedThroughputExceededException",
  "RequestLimitExceeded",
  "RequestThrottled",
  "RequestThrottledException",
  "SlowDown",
  "ThrottledException",
  "Throttling",
  "ThrottlingException",
  "TooManyRequestsException",
  "TransactionInProgressException"
];
var TRANSIENT_ERROR_CODES = ["TimeoutError", "RequestTimeout", "RequestTimeoutException"];
var TRANSIENT_ERROR_STATUS_CODES = [500, 502, 503, 504];
var NODEJS_TIMEOUT_ERROR_CODES = ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"];

// node_modules/@smithy/service-error-classification/dist-es/index.js
var isClockSkewCorrectedError = (error) => error.$metadata?.clockSkewCorrected;
var isThrottlingError = (error) => error.$metadata?.httpStatusCode === 429 || THROTTLING_ERROR_CODES.includes(error.name) || error.$retryable?.throttling == true;
var isTransientError = (error) => isClockSkewCorrectedError(error) || TRANSIENT_ERROR_CODES.includes(error.name) || NODEJS_TIMEOUT_ERROR_CODES.includes(error?.code || "") || TRANSIENT_ERROR_STATUS_CODES.includes(error.$metadata?.httpStatusCode || 0);
var isServerError = (error) => {
  if (error.$metadata?.httpStatusCode !== void 0) {
    const statusCode = error.$metadata.httpStatusCode;
    if (500 <= statusCode && statusCode <= 599 && !isTransientError(error)) {
      return true;
    }
    return false;
  }
  return false;
};

// node_modules/@smithy/util-retry/dist-es/DefaultRateLimiter.js
var DefaultRateLimiter = class {
  constructor(options) {
    this.currentCapacity = 0;
    this.enabled = false;
    this.lastMaxRate = 0;
    this.measuredTxRate = 0;
    this.requestCount = 0;
    this.lastTimestamp = 0;
    this.timeWindow = 0;
    this.beta = options?.beta ?? 0.7;
    this.minCapacity = options?.minCapacity ?? 1;
    this.minFillRate = options?.minFillRate ?? 0.5;
    this.scaleConstant = options?.scaleConstant ?? 0.4;
    this.smooth = options?.smooth ?? 0.8;
    const currentTimeInSeconds = this.getCurrentTimeInSeconds();
    this.lastThrottleTime = currentTimeInSeconds;
    this.lastTxRateBucket = Math.floor(this.getCurrentTimeInSeconds());
    this.fillRate = this.minFillRate;
    this.maxCapacity = this.minCapacity;
  }
  getCurrentTimeInSeconds() {
    return Date.now() / 1e3;
  }
  async getSendToken() {
    return this.acquireTokenBucket(1);
  }
  async acquireTokenBucket(amount) {
    if (!this.enabled) {
      return;
    }
    this.refillTokenBucket();
    if (amount > this.currentCapacity) {
      const delay = (amount - this.currentCapacity) / this.fillRate * 1e3;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    this.currentCapacity = this.currentCapacity - amount;
  }
  refillTokenBucket() {
    const timestamp = this.getCurrentTimeInSeconds();
    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
      return;
    }
    const fillAmount = (timestamp - this.lastTimestamp) * this.fillRate;
    this.currentCapacity = Math.min(this.maxCapacity, this.currentCapacity + fillAmount);
    this.lastTimestamp = timestamp;
  }
  updateClientSendingRate(response) {
    let calculatedRate;
    this.updateMeasuredRate();
    if (isThrottlingError(response)) {
      const rateToUse = !this.enabled ? this.measuredTxRate : Math.min(this.measuredTxRate, this.fillRate);
      this.lastMaxRate = rateToUse;
      this.calculateTimeWindow();
      this.lastThrottleTime = this.getCurrentTimeInSeconds();
      calculatedRate = this.cubicThrottle(rateToUse);
      this.enableTokenBucket();
    } else {
      this.calculateTimeWindow();
      calculatedRate = this.cubicSuccess(this.getCurrentTimeInSeconds());
    }
    const newRate = Math.min(calculatedRate, 2 * this.measuredTxRate);
    this.updateTokenBucketRate(newRate);
  }
  calculateTimeWindow() {
    this.timeWindow = this.getPrecise(Math.pow(this.lastMaxRate * (1 - this.beta) / this.scaleConstant, 1 / 3));
  }
  cubicThrottle(rateToUse) {
    return this.getPrecise(rateToUse * this.beta);
  }
  cubicSuccess(timestamp) {
    return this.getPrecise(this.scaleConstant * Math.pow(timestamp - this.lastThrottleTime - this.timeWindow, 3) + this.lastMaxRate);
  }
  enableTokenBucket() {
    this.enabled = true;
  }
  updateTokenBucketRate(newRate) {
    this.refillTokenBucket();
    this.fillRate = Math.max(newRate, this.minFillRate);
    this.maxCapacity = Math.max(newRate, this.minCapacity);
    this.currentCapacity = Math.min(this.currentCapacity, this.maxCapacity);
  }
  updateMeasuredRate() {
    const t2 = this.getCurrentTimeInSeconds();
    const timeBucket = Math.floor(t2 * 2) / 2;
    this.requestCount++;
    if (timeBucket > this.lastTxRateBucket) {
      const currentRate = this.requestCount / (timeBucket - this.lastTxRateBucket);
      this.measuredTxRate = this.getPrecise(currentRate * this.smooth + this.measuredTxRate * (1 - this.smooth));
      this.requestCount = 0;
      this.lastTxRateBucket = timeBucket;
    }
  }
  getPrecise(num) {
    return parseFloat(num.toFixed(8));
  }
};

// node_modules/@smithy/util-retry/dist-es/constants.js
var DEFAULT_RETRY_DELAY_BASE = 100;
var MAXIMUM_RETRY_DELAY = 20 * 1e3;
var THROTTLING_RETRY_DELAY_BASE = 500;
var INITIAL_RETRY_TOKENS = 500;
var RETRY_COST = 5;
var TIMEOUT_RETRY_COST = 10;
var NO_RETRY_INCREMENT = 1;
var INVOCATION_ID_HEADER = "amz-sdk-invocation-id";
var REQUEST_HEADER = "amz-sdk-request";

// node_modules/@smithy/util-retry/dist-es/defaultRetryBackoffStrategy.js
var getDefaultRetryBackoffStrategy = () => {
  let delayBase = DEFAULT_RETRY_DELAY_BASE;
  const computeNextBackoffDelay = (attempts) => {
    return Math.floor(Math.min(MAXIMUM_RETRY_DELAY, Math.random() * 2 ** attempts * delayBase));
  };
  const setDelayBase = (delay) => {
    delayBase = delay;
  };
  return {
    computeNextBackoffDelay,
    setDelayBase
  };
};

// node_modules/@smithy/util-retry/dist-es/defaultRetryToken.js
var createDefaultRetryToken = ({ retryDelay, retryCount, retryCost }) => {
  const getRetryCount = () => retryCount;
  const getRetryDelay = () => Math.min(MAXIMUM_RETRY_DELAY, retryDelay);
  const getRetryCost = () => retryCost;
  return {
    getRetryCount,
    getRetryDelay,
    getRetryCost
  };
};

// node_modules/@smithy/util-retry/dist-es/StandardRetryStrategy.js
var StandardRetryStrategy = class {
  constructor(maxAttempts) {
    this.maxAttempts = maxAttempts;
    this.mode = RETRY_MODES.STANDARD;
    this.capacity = INITIAL_RETRY_TOKENS;
    this.retryBackoffStrategy = getDefaultRetryBackoffStrategy();
    this.maxAttemptsProvider = typeof maxAttempts === "function" ? maxAttempts : async () => maxAttempts;
  }
  async acquireInitialRetryToken(retryTokenScope) {
    return createDefaultRetryToken({
      retryDelay: DEFAULT_RETRY_DELAY_BASE,
      retryCount: 0
    });
  }
  async refreshRetryTokenForRetry(token, errorInfo) {
    const maxAttempts = await this.getMaxAttempts();
    if (this.shouldRetry(token, errorInfo, maxAttempts)) {
      const errorType = errorInfo.errorType;
      this.retryBackoffStrategy.setDelayBase(errorType === "THROTTLING" ? THROTTLING_RETRY_DELAY_BASE : DEFAULT_RETRY_DELAY_BASE);
      const delayFromErrorType = this.retryBackoffStrategy.computeNextBackoffDelay(token.getRetryCount());
      const retryDelay = errorInfo.retryAfterHint ? Math.max(errorInfo.retryAfterHint.getTime() - Date.now() || 0, delayFromErrorType) : delayFromErrorType;
      const capacityCost = this.getCapacityCost(errorType);
      this.capacity -= capacityCost;
      return createDefaultRetryToken({
        retryDelay,
        retryCount: token.getRetryCount() + 1,
        retryCost: capacityCost
      });
    }
    throw new Error("No retry token available");
  }
  recordSuccess(token) {
    this.capacity = Math.max(INITIAL_RETRY_TOKENS, this.capacity + (token.getRetryCost() ?? NO_RETRY_INCREMENT));
  }
  getCapacity() {
    return this.capacity;
  }
  async getMaxAttempts() {
    try {
      return await this.maxAttemptsProvider();
    } catch (error) {
      console.warn(`Max attempts provider could not resolve. Using default of ${DEFAULT_MAX_ATTEMPTS}`);
      return DEFAULT_MAX_ATTEMPTS;
    }
  }
  shouldRetry(tokenToRenew, errorInfo, maxAttempts) {
    const attempts = tokenToRenew.getRetryCount() + 1;
    return attempts < maxAttempts && this.capacity >= this.getCapacityCost(errorInfo.errorType) && this.isRetryableError(errorInfo.errorType);
  }
  getCapacityCost(errorType) {
    return errorType === "TRANSIENT" ? TIMEOUT_RETRY_COST : RETRY_COST;
  }
  isRetryableError(errorType) {
    return errorType === "THROTTLING" || errorType === "TRANSIENT";
  }
};

// node_modules/@smithy/util-retry/dist-es/AdaptiveRetryStrategy.js
var AdaptiveRetryStrategy = class {
  constructor(maxAttemptsProvider, options) {
    this.maxAttemptsProvider = maxAttemptsProvider;
    this.mode = RETRY_MODES.ADAPTIVE;
    const { rateLimiter } = options ?? {};
    this.rateLimiter = rateLimiter ?? new DefaultRateLimiter();
    this.standardRetryStrategy = new StandardRetryStrategy(maxAttemptsProvider);
  }
  async acquireInitialRetryToken(retryTokenScope) {
    await this.rateLimiter.getSendToken();
    return this.standardRetryStrategy.acquireInitialRetryToken(retryTokenScope);
  }
  async refreshRetryTokenForRetry(tokenToRenew, errorInfo) {
    this.rateLimiter.updateClientSendingRate(errorInfo);
    return this.standardRetryStrategy.refreshRetryTokenForRetry(tokenToRenew, errorInfo);
  }
  recordSuccess(token) {
    this.rateLimiter.updateClientSendingRate({});
    this.standardRetryStrategy.recordSuccess(token);
  }
};

// node_modules/uuid/dist/esm-browser/rng.js
var getRandomValues;
var rnds8 = new Uint8Array(16);
function rng() {
  if (!getRandomValues) {
    getRandomValues = typeof crypto !== "undefined" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);
    if (!getRandomValues) {
      throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
    }
  }
  return getRandomValues(rnds8);
}

// node_modules/uuid/dist/esm-browser/stringify.js
var byteToHex = [];
for (let i2 = 0; i2 < 256; ++i2) {
  byteToHex.push((i2 + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]];
}

// node_modules/uuid/dist/esm-browser/native.js
var randomUUID = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID.bind(crypto);
var native_default = {
  randomUUID
};

// node_modules/uuid/dist/esm-browser/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i2 = 0; i2 < 16; ++i2) {
      buf[offset + i2] = rnds[i2];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// node_modules/@smithy/middleware-retry/dist-es/util.js
var asSdkError = (error) => {
  if (error instanceof Error)
    return error;
  if (error instanceof Object)
    return Object.assign(new Error(), error);
  if (typeof error === "string")
    return new Error(error);
  return new Error(`AWS SDK error wrapper for ${error}`);
};

// node_modules/@smithy/middleware-retry/dist-es/configurations.js
var resolveRetryConfig = (input) => {
  const { retryStrategy } = input;
  const maxAttempts = normalizeProvider(input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  return {
    ...input,
    maxAttempts,
    retryStrategy: async () => {
      if (retryStrategy) {
        return retryStrategy;
      }
      const retryMode = await normalizeProvider(input.retryMode)();
      if (retryMode === RETRY_MODES.ADAPTIVE) {
        return new AdaptiveRetryStrategy(maxAttempts);
      }
      return new StandardRetryStrategy(maxAttempts);
    }
  };
};

// node_modules/@smithy/middleware-retry/dist-es/isStreamingPayload/isStreamingPayload.browser.js
var isStreamingPayload = (request) => request?.body instanceof ReadableStream;

// node_modules/@smithy/middleware-retry/dist-es/retryMiddleware.js
var retryMiddleware = (options) => (next, context) => async (args) => {
  let retryStrategy = await options.retryStrategy();
  const maxAttempts = await options.maxAttempts();
  if (isRetryStrategyV2(retryStrategy)) {
    retryStrategy = retryStrategy;
    let retryToken = await retryStrategy.acquireInitialRetryToken(context["partition_id"]);
    let lastError = new Error();
    let attempts = 0;
    let totalRetryDelay = 0;
    const { request } = args;
    const isRequest = HttpRequest.isInstance(request);
    if (isRequest) {
      request.headers[INVOCATION_ID_HEADER] = v4_default();
    }
    while (true) {
      try {
        if (isRequest) {
          request.headers[REQUEST_HEADER] = `attempt=${attempts + 1}; max=${maxAttempts}`;
        }
        const { response, output } = await next(args);
        retryStrategy.recordSuccess(retryToken);
        output.$metadata.attempts = attempts + 1;
        output.$metadata.totalRetryDelay = totalRetryDelay;
        return { response, output };
      } catch (e2) {
        const retryErrorInfo = getRetryErrorInfo(e2);
        lastError = asSdkError(e2);
        if (isRequest && isStreamingPayload(request)) {
          (context.logger instanceof NoOpLogger ? console : context.logger)?.warn("An error was encountered in a non-retryable streaming request.");
          throw lastError;
        }
        try {
          retryToken = await retryStrategy.refreshRetryTokenForRetry(retryToken, retryErrorInfo);
        } catch (refreshError) {
          if (!lastError.$metadata) {
            lastError.$metadata = {};
          }
          lastError.$metadata.attempts = attempts + 1;
          lastError.$metadata.totalRetryDelay = totalRetryDelay;
          throw lastError;
        }
        attempts = retryToken.getRetryCount();
        const delay = retryToken.getRetryDelay();
        totalRetryDelay += delay;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  } else {
    retryStrategy = retryStrategy;
    if (retryStrategy?.mode)
      context.userAgent = [...context.userAgent || [], ["cfg/retry-mode", retryStrategy.mode]];
    return retryStrategy.retry(next, args);
  }
};
var isRetryStrategyV2 = (retryStrategy) => typeof retryStrategy.acquireInitialRetryToken !== "undefined" && typeof retryStrategy.refreshRetryTokenForRetry !== "undefined" && typeof retryStrategy.recordSuccess !== "undefined";
var getRetryErrorInfo = (error) => {
  const errorInfo = {
    error,
    errorType: getRetryErrorType(error)
  };
  const retryAfterHint = getRetryAfterHint(error.$response);
  if (retryAfterHint) {
    errorInfo.retryAfterHint = retryAfterHint;
  }
  return errorInfo;
};
var getRetryErrorType = (error) => {
  if (isThrottlingError(error))
    return "THROTTLING";
  if (isTransientError(error))
    return "TRANSIENT";
  if (isServerError(error))
    return "SERVER_ERROR";
  return "CLIENT_ERROR";
};
var retryMiddlewareOptions = {
  name: "retryMiddleware",
  tags: ["RETRY"],
  step: "finalizeRequest",
  priority: "high",
  override: true
};
var getRetryPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(retryMiddleware(options), retryMiddlewareOptions);
  }
});
var getRetryAfterHint = (response) => {
  if (!HttpResponse.isInstance(response))
    return;
  const retryAfterHeaderName = Object.keys(response.headers).find((key) => key.toLowerCase() === "retry-after");
  if (!retryAfterHeaderName)
    return;
  const retryAfter = response.headers[retryAfterHeaderName];
  const retryAfterSeconds = Number(retryAfter);
  if (!Number.isNaN(retryAfterSeconds))
    return new Date(retryAfterSeconds * 1e3);
  const retryAfterDate = new Date(retryAfter);
  return retryAfterDate;
};

// node_modules/@aws-sdk/client-s3/dist-es/endpoint/EndpointParameters.js
var resolveClientEndpointParameters = (options) => {
  return {
    ...options,
    useFipsEndpoint: options.useFipsEndpoint ?? false,
    useDualstackEndpoint: options.useDualstackEndpoint ?? false,
    forcePathStyle: options.forcePathStyle ?? false,
    useAccelerateEndpoint: options.useAccelerateEndpoint ?? false,
    useGlobalEndpoint: options.useGlobalEndpoint ?? false,
    disableMultiregionAccessPoints: options.disableMultiregionAccessPoints ?? false,
    defaultSigningName: "s3"
  };
};
var commonParams = {
  ForcePathStyle: { type: "clientContextParams", name: "forcePathStyle" },
  UseArnRegion: { type: "clientContextParams", name: "useArnRegion" },
  DisableMultiRegionAccessPoints: { type: "clientContextParams", name: "disableMultiregionAccessPoints" },
  Accelerate: { type: "clientContextParams", name: "useAccelerateEndpoint" },
  DisableS3ExpressSessionAuth: { type: "clientContextParams", name: "disableS3ExpressSessionAuth" },
  UseGlobalEndpoint: { type: "builtInParams", name: "useGlobalEndpoint" },
  UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
  Endpoint: { type: "builtInParams", name: "endpoint" },
  Region: { type: "builtInParams", name: "region" },
  UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
};

// node_modules/@aws-sdk/client-s3/dist-es/models/S3ServiceException.js
var S3ServiceException = class _S3ServiceException extends ServiceException {
  constructor(options) {
    super(options);
    Object.setPrototypeOf(this, _S3ServiceException.prototype);
  }
};

// node_modules/@aws-sdk/client-s3/dist-es/models/models_0.js
var NoSuchUpload = class _NoSuchUpload extends S3ServiceException {
  constructor(opts) {
    super({
      name: "NoSuchUpload",
      $fault: "client",
      ...opts
    });
    this.name = "NoSuchUpload";
    this.$fault = "client";
    Object.setPrototypeOf(this, _NoSuchUpload.prototype);
  }
};
var ObjectNotInActiveTierError = class _ObjectNotInActiveTierError extends S3ServiceException {
  constructor(opts) {
    super({
      name: "ObjectNotInActiveTierError",
      $fault: "client",
      ...opts
    });
    this.name = "ObjectNotInActiveTierError";
    this.$fault = "client";
    Object.setPrototypeOf(this, _ObjectNotInActiveTierError.prototype);
  }
};
var BucketAlreadyExists = class _BucketAlreadyExists extends S3ServiceException {
  constructor(opts) {
    super({
      name: "BucketAlreadyExists",
      $fault: "client",
      ...opts
    });
    this.name = "BucketAlreadyExists";
    this.$fault = "client";
    Object.setPrototypeOf(this, _BucketAlreadyExists.prototype);
  }
};
var BucketAlreadyOwnedByYou = class _BucketAlreadyOwnedByYou extends S3ServiceException {
  constructor(opts) {
    super({
      name: "BucketAlreadyOwnedByYou",
      $fault: "client",
      ...opts
    });
    this.name = "BucketAlreadyOwnedByYou";
    this.$fault = "client";
    Object.setPrototypeOf(this, _BucketAlreadyOwnedByYou.prototype);
  }
};
var NoSuchBucket = class _NoSuchBucket extends S3ServiceException {
  constructor(opts) {
    super({
      name: "NoSuchBucket",
      $fault: "client",
      ...opts
    });
    this.name = "NoSuchBucket";
    this.$fault = "client";
    Object.setPrototypeOf(this, _NoSuchBucket.prototype);
  }
};
var AnalyticsFilter;
(function(AnalyticsFilter2) {
  AnalyticsFilter2.visit = (value, visitor) => {
    if (value.Prefix !== void 0)
      return visitor.Prefix(value.Prefix);
    if (value.Tag !== void 0)
      return visitor.Tag(value.Tag);
    if (value.And !== void 0)
      return visitor.And(value.And);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  };
})(AnalyticsFilter || (AnalyticsFilter = {}));
var LifecycleRuleFilter;
(function(LifecycleRuleFilter2) {
  LifecycleRuleFilter2.visit = (value, visitor) => {
    if (value.Prefix !== void 0)
      return visitor.Prefix(value.Prefix);
    if (value.Tag !== void 0)
      return visitor.Tag(value.Tag);
    if (value.ObjectSizeGreaterThan !== void 0)
      return visitor.ObjectSizeGreaterThan(value.ObjectSizeGreaterThan);
    if (value.ObjectSizeLessThan !== void 0)
      return visitor.ObjectSizeLessThan(value.ObjectSizeLessThan);
    if (value.And !== void 0)
      return visitor.And(value.And);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  };
})(LifecycleRuleFilter || (LifecycleRuleFilter = {}));
var MetricsFilter;
(function(MetricsFilter2) {
  MetricsFilter2.visit = (value, visitor) => {
    if (value.Prefix !== void 0)
      return visitor.Prefix(value.Prefix);
    if (value.Tag !== void 0)
      return visitor.Tag(value.Tag);
    if (value.AccessPointArn !== void 0)
      return visitor.AccessPointArn(value.AccessPointArn);
    if (value.And !== void 0)
      return visitor.And(value.And);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  };
})(MetricsFilter || (MetricsFilter = {}));
var ReplicationRuleFilter;
(function(ReplicationRuleFilter2) {
  ReplicationRuleFilter2.visit = (value, visitor) => {
    if (value.Prefix !== void 0)
      return visitor.Prefix(value.Prefix);
    if (value.Tag !== void 0)
      return visitor.Tag(value.Tag);
    if (value.And !== void 0)
      return visitor.And(value.And);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  };
})(ReplicationRuleFilter || (ReplicationRuleFilter = {}));
var InvalidObjectState = class _InvalidObjectState extends S3ServiceException {
  constructor(opts) {
    super({
      name: "InvalidObjectState",
      $fault: "client",
      ...opts
    });
    this.name = "InvalidObjectState";
    this.$fault = "client";
    Object.setPrototypeOf(this, _InvalidObjectState.prototype);
    this.StorageClass = opts.StorageClass;
    this.AccessTier = opts.AccessTier;
  }
};
var NoSuchKey = class _NoSuchKey extends S3ServiceException {
  constructor(opts) {
    super({
      name: "NoSuchKey",
      $fault: "client",
      ...opts
    });
    this.name = "NoSuchKey";
    this.$fault = "client";
    Object.setPrototypeOf(this, _NoSuchKey.prototype);
  }
};
var NotFound = class _NotFound extends S3ServiceException {
  constructor(opts) {
    super({
      name: "NotFound",
      $fault: "client",
      ...opts
    });
    this.name = "NotFound";
    this.$fault = "client";
    Object.setPrototypeOf(this, _NotFound.prototype);
  }
};
var SessionCredentialsFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.SecretAccessKey && { SecretAccessKey: SENSITIVE_STRING },
  ...obj.SessionToken && { SessionToken: SENSITIVE_STRING }
});
var CreateSessionOutputFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.Credentials && { Credentials: SessionCredentialsFilterSensitiveLog(obj.Credentials) }
});
var GetObjectOutputFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING }
});
var GetObjectRequestFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.SSECustomerKey && { SSECustomerKey: SENSITIVE_STRING }
});

// node_modules/@smithy/core/dist-es/middleware-http-auth-scheme/getHttpAuthSchemeEndpointRuleSetPlugin.js
var httpAuthSchemeEndpointRuleSetMiddlewareOptions = {
  step: "serialize",
  tags: ["HTTP_AUTH_SCHEME"],
  name: "httpAuthSchemeMiddleware",
  override: true,
  relation: "before",
  toMiddleware: endpointMiddlewareOptions.name
};

// node_modules/@smithy/core/dist-es/middleware-http-auth-scheme/getHttpAuthSchemePlugin.js
var httpAuthSchemeMiddlewareOptions = {
  step: "serialize",
  tags: ["HTTP_AUTH_SCHEME"],
  name: "httpAuthSchemeMiddleware",
  override: true,
  relation: "before",
  toMiddleware: serializerMiddlewareOption.name
};

// node_modules/@smithy/core/dist-es/middleware-http-signing/getHttpSigningMiddleware.js
var httpSigningMiddlewareOptions = {
  step: "finalizeRequest",
  tags: ["HTTP_SIGNING"],
  name: "httpSigningMiddleware",
  aliases: ["apiKeyMiddleware", "tokenMiddleware", "awsAuthMiddleware"],
  override: true,
  relation: "after",
  toMiddleware: retryMiddlewareOptions.name
};

// node_modules/@smithy/core/dist-es/util-identity-and-auth/memoizeIdentityProvider.js
var createIsIdentityExpiredFunction = (expirationMs) => (identity) => doesIdentityRequireRefresh(identity) && identity.expiration.getTime() - Date.now() < expirationMs;
var EXPIRATION_MS = 3e5;
var isIdentityExpired = createIsIdentityExpiredFunction(EXPIRATION_MS);
var doesIdentityRequireRefresh = (identity) => identity.expiration !== void 0;

// node_modules/@smithy/core/dist-es/protocols/requestBuilder.js
function requestBuilder(input, context) {
  return new RequestBuilder(input, context);
}
var RequestBuilder = class {
  constructor(input, context) {
    this.input = input;
    this.context = context;
    this.query = {};
    this.method = "";
    this.headers = {};
    this.path = "";
    this.body = null;
    this.hostname = "";
    this.resolvePathStack = [];
  }
  async build() {
    const { hostname, protocol = "https", port, path: basePath } = await this.context.endpoint();
    this.path = basePath;
    for (const resolvePath of this.resolvePathStack) {
      resolvePath(this.path);
    }
    return new HttpRequest({
      protocol,
      hostname: this.hostname || hostname,
      port,
      method: this.method,
      path: this.path,
      query: this.query,
      body: this.body,
      headers: this.headers
    });
  }
  hn(hostname) {
    this.hostname = hostname;
    return this;
  }
  bp(uriLabel) {
    this.resolvePathStack.push((basePath) => {
      this.path = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}` + uriLabel;
    });
    return this;
  }
  p(memberName, labelValueProvider, uriLabel, isGreedyLabel) {
    this.resolvePathStack.push((path) => {
      this.path = resolvedPath(path, this.input, memberName, labelValueProvider, uriLabel, isGreedyLabel);
    });
    return this;
  }
  h(headers) {
    this.headers = headers;
    return this;
  }
  q(query) {
    this.query = query;
    return this;
  }
  b(body) {
    this.body = body;
    return this;
  }
  m(method) {
    this.method = method;
    return this;
  }
};

// node_modules/@aws-sdk/core/dist-es/protocols/common.js
var collectBodyString = (streamBody, context) => collectBody(streamBody, context).then((body) => context.utf8Encoder(body));

// node_modules/@aws-sdk/core/dist-es/protocols/xml/parseXmlBody.js
var import_fast_xml_parser = __toESM(require_fxp());
var parseXmlBody = (streamBody, context) => collectBodyString(streamBody, context).then((encoded) => {
  if (encoded.length) {
    const parser = new import_fast_xml_parser.XMLParser({
      attributeNamePrefix: "",
      htmlEntities: true,
      ignoreAttributes: false,
      ignoreDeclaration: true,
      parseTagValue: false,
      trimValues: false,
      tagValueProcessor: (_, val2) => val2.trim() === "" && val2.includes("\n") ? "" : void 0
    });
    parser.addEntity("#xD", "\r");
    parser.addEntity("#10", "\n");
    let parsedObj;
    try {
      parsedObj = parser.parse(encoded, true);
    } catch (e2) {
      if (e2 && typeof e2 === "object") {
        Object.defineProperty(e2, "$responseBodyText", {
          value: encoded
        });
      }
      throw e2;
    }
    const textNodeName = "#text";
    const key = Object.keys(parsedObj)[0];
    const parsedObjToReturn = parsedObj[key];
    if (parsedObjToReturn[textNodeName]) {
      parsedObjToReturn[key] = parsedObjToReturn[textNodeName];
      delete parsedObjToReturn[textNodeName];
    }
    return getValueFromTextNode(parsedObjToReturn);
  }
  return {};
});
var parseXmlErrorBody = async (errorBody, context) => {
  const value = await parseXmlBody(errorBody, context);
  if (value.Error) {
    value.Error.message = value.Error.message ?? value.Error.Message;
  }
  return value;
};
var loadRestXmlErrorCode = (output, data) => {
  if (data?.Error?.Code !== void 0) {
    return data.Error.Code;
  }
  if (data?.Code !== void 0) {
    return data.Code;
  }
  if (output.statusCode == 404) {
    return "NotFound";
  }
};

// node_modules/@aws-sdk/xml-builder/dist-es/escape-attribute.js
function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// node_modules/@aws-sdk/xml-builder/dist-es/escape-element.js
function escapeElement(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#x0D;").replace(/\n/g, "&#x0A;").replace(/\u0085/g, "&#x85;").replace(/\u2028/, "&#x2028;");
}

// node_modules/@aws-sdk/xml-builder/dist-es/XmlText.js
var XmlText = class {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return escapeElement("" + this.value);
  }
};

// node_modules/@aws-sdk/xml-builder/dist-es/XmlNode.js
var XmlNode = class _XmlNode {
  static of(name, childText, withName) {
    const node = new _XmlNode(name);
    if (childText !== void 0) {
      node.addChildNode(new XmlText(childText));
    }
    if (withName !== void 0) {
      node.withName(withName);
    }
    return node;
  }
  constructor(name, children = []) {
    this.name = name;
    this.children = children;
    this.attributes = {};
  }
  withName(name) {
    this.name = name;
    return this;
  }
  addAttribute(name, value) {
    this.attributes[name] = value;
    return this;
  }
  addChildNode(child) {
    this.children.push(child);
    return this;
  }
  removeAttribute(name) {
    delete this.attributes[name];
    return this;
  }
  n(name) {
    this.name = name;
    return this;
  }
  c(child) {
    this.children.push(child);
    return this;
  }
  a(name, value) {
    if (value != null) {
      this.attributes[name] = value;
    }
    return this;
  }
  cc(input, field, withName = field) {
    if (input[field] != null) {
      const node = _XmlNode.of(field, input[field]).withName(withName);
      this.c(node);
    }
  }
  l(input, listName, memberName, valueProvider) {
    if (input[listName] != null) {
      const nodes = valueProvider();
      nodes.map((node) => {
        node.withName(memberName);
        this.c(node);
      });
    }
  }
  lc(input, listName, memberName, valueProvider) {
    if (input[listName] != null) {
      const nodes = valueProvider();
      const containerNode = new _XmlNode(memberName);
      nodes.map((node) => {
        containerNode.c(node);
      });
      this.c(containerNode);
    }
  }
  toString() {
    const hasChildren = Boolean(this.children.length);
    let xmlText = `<${this.name}`;
    const attributes = this.attributes;
    for (const attributeName of Object.keys(attributes)) {
      const attribute = attributes[attributeName];
      if (attribute != null) {
        xmlText += ` ${attributeName}="${escapeAttribute("" + attribute)}"`;
      }
    }
    return xmlText += !hasChildren ? "/>" : `>${this.children.map((c2) => c2.toString()).join("")}</${this.name}>`;
  }
};

// node_modules/@aws-sdk/client-s3/dist-es/models/models_1.js
var ObjectAlreadyInActiveTierError = class _ObjectAlreadyInActiveTierError extends S3ServiceException {
  constructor(opts) {
    super({
      name: "ObjectAlreadyInActiveTierError",
      $fault: "client",
      ...opts
    });
    this.name = "ObjectAlreadyInActiveTierError";
    this.$fault = "client";
    Object.setPrototypeOf(this, _ObjectAlreadyInActiveTierError.prototype);
  }
};
var SelectObjectContentEventStream;
(function(SelectObjectContentEventStream2) {
  SelectObjectContentEventStream2.visit = (value, visitor) => {
    if (value.Records !== void 0)
      return visitor.Records(value.Records);
    if (value.Stats !== void 0)
      return visitor.Stats(value.Stats);
    if (value.Progress !== void 0)
      return visitor.Progress(value.Progress);
    if (value.Cont !== void 0)
      return visitor.Cont(value.Cont);
    if (value.End !== void 0)
      return visitor.End(value.End);
    return visitor._(value.$unknown[0], value.$unknown[1]);
  };
})(SelectObjectContentEventStream || (SelectObjectContentEventStream = {}));
var PutObjectOutputFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING },
  ...obj.SSEKMSEncryptionContext && { SSEKMSEncryptionContext: SENSITIVE_STRING }
});
var PutObjectRequestFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.SSECustomerKey && { SSECustomerKey: SENSITIVE_STRING },
  ...obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING },
  ...obj.SSEKMSEncryptionContext && { SSEKMSEncryptionContext: SENSITIVE_STRING }
});

// node_modules/@aws-sdk/client-s3/dist-es/protocols/Aws_restXml.js
var se_CreateBucketCommand = async (input, context) => {
  const b2 = requestBuilder(input, context);
  const headers = map({}, isSerializableHeaderValue, {
    "content-type": "application/xml",
    [_xaa]: input[_ACL],
    [_xagfc]: input[_GFC],
    [_xagr]: input[_GR],
    [_xagra]: input[_GRACP],
    [_xagw]: input[_GW],
    [_xagwa]: input[_GWACP],
    [_xabole]: [() => isSerializableHeaderValue(input[_OLEFB]), () => input[_OLEFB].toString()],
    [_xaoo]: input[_OO]
  });
  b2.bp("/");
  b2.p("Bucket", () => input.Bucket, "{Bucket}", false);
  let body;
  let contents;
  if (input.CreateBucketConfiguration !== void 0) {
    contents = se_CreateBucketConfiguration(input.CreateBucketConfiguration, context);
    body = _ve;
    contents.a("xmlns", "http://s3.amazonaws.com/doc/2006-03-01/");
    body += contents.toString();
  }
  b2.m("PUT").h(headers).b(body);
  return b2.build();
};
var se_CreateSessionCommand = async (input, context) => {
  const b2 = requestBuilder(input, context);
  const headers = map({}, isSerializableHeaderValue, {
    [_xacsm]: input[_SM]
  });
  b2.bp("/");
  b2.p("Bucket", () => input.Bucket, "{Bucket}", false);
  const query = map({
    [_s]: [, ""]
  });
  let body;
  b2.m("GET").h(headers).q(query).b(body);
  return b2.build();
};
var se_DeleteObjectCommand = async (input, context) => {
  const b2 = requestBuilder(input, context);
  const headers = map({}, isSerializableHeaderValue, {
    [_xam]: input[_MFA],
    [_xarp]: input[_RP],
    [_xabgr]: [() => isSerializableHeaderValue(input[_BGR]), () => input[_BGR].toString()],
    [_xaebo]: input[_EBO]
  });
  b2.bp("/{Key+}");
  b2.p("Bucket", () => input.Bucket, "{Bucket}", false);
  b2.p("Key", () => input.Key, "{Key+}", true);
  const query = map({
    [_xi]: [, "DeleteObject"],
    [_vI]: [, input[_VI]]
  });
  let body;
  b2.m("DELETE").h(headers).q(query).b(body);
  return b2.build();
};
var se_GetObjectCommand = async (input, context) => {
  const b2 = requestBuilder(input, context);
  const headers = map({}, isSerializableHeaderValue, {
    [_im]: input[_IM],
    [_ims]: [() => isSerializableHeaderValue(input[_IMS]), () => dateToUtcString(input[_IMS]).toString()],
    [_inm]: input[_INM],
    [_ius]: [() => isSerializableHeaderValue(input[_IUS]), () => dateToUtcString(input[_IUS]).toString()],
    [_ra]: input[_R],
    [_xasseca]: input[_SSECA],
    [_xasseck]: input[_SSECK],
    [_xasseckm]: input[_SSECKMD],
    [_xarp]: input[_RP],
    [_xaebo]: input[_EBO],
    [_xacm]: input[_CM]
  });
  b2.bp("/{Key+}");
  b2.p("Bucket", () => input.Bucket, "{Bucket}", false);
  b2.p("Key", () => input.Key, "{Key+}", true);
  const query = map({
    [_xi]: [, "GetObject"],
    [_rcc]: [, input[_RCC]],
    [_rcd]: [, input[_RCD]],
    [_rce]: [, input[_RCE]],
    [_rcl]: [, input[_RCL]],
    [_rct]: [, input[_RCT]],
    [_re]: [() => input.ResponseExpires !== void 0, () => dateToUtcString(input[_RE]).toString()],
    [_vI]: [, input[_VI]],
    [_pN]: [() => input.PartNumber !== void 0, () => input[_PN].toString()]
  });
  let body;
  b2.m("GET").h(headers).q(query).b(body);
  return b2.build();
};
var se_ListBucketsCommand = async (input, context) => {
  const b2 = requestBuilder(input, context);
  const headers = {
    "content-type": "application/xml"
  };
  b2.bp("/");
  const query = map({
    [_xi]: [, "ListBuckets"]
  });
  let body;
  body = "";
  b2.m("GET").h(headers).q(query).b(body);
  return b2.build();
};
var se_ListObjectsV2Command = async (input, context) => {
  const b2 = requestBuilder(input, context);
  const headers = map({}, isSerializableHeaderValue, {
    [_xarp]: input[_RP],
    [_xaebo]: input[_EBO],
    [_xaooa]: [
      () => isSerializableHeaderValue(input[_OOA]),
      () => (input[_OOA] || []).map((_entry) => _entry).join(", ")
    ]
  });
  b2.bp("/");
  b2.p("Bucket", () => input.Bucket, "{Bucket}", false);
  const query = map({
    [_lt]: [, "2"],
    [_de]: [, input[_D]],
    [_et]: [, input[_ET]],
    [_mk]: [() => input.MaxKeys !== void 0, () => input[_MK].toString()],
    [_pr]: [, input[_P]],
    [_ct_]: [, input[_CTo]],
    [_fo]: [() => input.FetchOwner !== void 0, () => input[_FO].toString()],
    [_sa]: [, input[_SA]]
  });
  let body;
  b2.m("GET").h(headers).q(query).b(body);
  return b2.build();
};
var se_PutObjectCommand = async (input, context) => {
  const b2 = requestBuilder(input, context);
  const headers = map({}, isSerializableHeaderValue, {
    [_ct]: input[_CT] || "application/octet-stream",
    [_xaa]: input[_ACL],
    [_cc]: input[_CC],
    [_cd]: input[_CD],
    [_ce]: input[_CE],
    [_cl]: input[_CL],
    [_cl_]: [() => isSerializableHeaderValue(input[_CLo]), () => input[_CLo].toString()],
    [_cm]: input[_CMD],
    [_xasca]: input[_CA],
    [_xacc]: input[_CCRC],
    [_xacc_]: input[_CCRCC],
    [_xacs]: input[_CSHA],
    [_xacs_]: input[_CSHAh],
    [_e]: [() => isSerializableHeaderValue(input[_E]), () => dateToUtcString(input[_E]).toString()],
    [_xagfc]: input[_GFC],
    [_xagr]: input[_GR],
    [_xagra]: input[_GRACP],
    [_xagwa]: input[_GWACP],
    [_xasse]: input[_SSE],
    [_xasc]: input[_SC],
    [_xawrl]: input[_WRL],
    [_xasseca]: input[_SSECA],
    [_xasseck]: input[_SSECK],
    [_xasseckm]: input[_SSECKMD],
    [_xasseakki]: input[_SSEKMSKI],
    [_xassec]: input[_SSEKMSEC],
    [_xassebke]: [() => isSerializableHeaderValue(input[_BKE]), () => input[_BKE].toString()],
    [_xarp]: input[_RP],
    [_xat]: input[_T],
    [_xaolm]: input[_OLM],
    [_xaolrud]: [
      () => isSerializableHeaderValue(input[_OLRUD]),
      () => (input[_OLRUD].toISOString().split(".")[0] + "Z").toString()
    ],
    [_xaollh]: input[_OLLHS],
    [_xaebo]: input[_EBO],
    ...input.Metadata !== void 0 && Object.keys(input.Metadata).reduce((acc, suffix) => {
      acc[`x-amz-meta-${suffix.toLowerCase()}`] = input.Metadata[suffix];
      return acc;
    }, {})
  });
  b2.bp("/{Key+}");
  b2.p("Bucket", () => input.Bucket, "{Bucket}", false);
  b2.p("Key", () => input.Key, "{Key+}", true);
  const query = map({
    [_xi]: [, "PutObject"]
  });
  let body;
  let contents;
  if (input.Body !== void 0) {
    contents = input.Body;
    body = contents;
  }
  b2.m("PUT").h(headers).q(query).b(body);
  return b2.build();
};
var de_CreateBucketCommand = async (output, context) => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents = map({
    $metadata: deserializeMetadata2(output),
    [_L]: [, output.headers[_lo]]
  });
  await collectBody(output.body, context);
  return contents;
};
var de_CreateSessionCommand = async (output, context) => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents = map({
    $metadata: deserializeMetadata2(output)
  });
  const data = expectNonNull(expectObject(await parseXmlBody(output.body, context)), "body");
  if (data[_C] != null) {
    contents[_C] = de_SessionCredentials(data[_C], context);
  }
  return contents;
};
var de_DeleteObjectCommand = async (output, context) => {
  if (output.statusCode !== 204 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents = map({
    $metadata: deserializeMetadata2(output),
    [_DM]: [() => void 0 !== output.headers[_xadm], () => parseBoolean(output.headers[_xadm])],
    [_VI]: [, output.headers[_xavi]],
    [_RC]: [, output.headers[_xarc]]
  });
  await collectBody(output.body, context);
  return contents;
};
var de_GetObjectCommand = async (output, context) => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents = map({
    $metadata: deserializeMetadata2(output),
    [_DM]: [() => void 0 !== output.headers[_xadm], () => parseBoolean(output.headers[_xadm])],
    [_AR]: [, output.headers[_ar]],
    [_Exp]: [, output.headers[_xae]],
    [_Re]: [, output.headers[_xar]],
    [_LM]: [() => void 0 !== output.headers[_lm], () => expectNonNull(parseRfc7231DateTime(output.headers[_lm]))],
    [_CLo]: [() => void 0 !== output.headers[_cl_], () => strictParseLong(output.headers[_cl_])],
    [_ETa]: [, output.headers[_eta]],
    [_CCRC]: [, output.headers[_xacc]],
    [_CCRCC]: [, output.headers[_xacc_]],
    [_CSHA]: [, output.headers[_xacs]],
    [_CSHAh]: [, output.headers[_xacs_]],
    [_MM]: [() => void 0 !== output.headers[_xamm], () => strictParseInt32(output.headers[_xamm])],
    [_VI]: [, output.headers[_xavi]],
    [_CC]: [, output.headers[_cc]],
    [_CD]: [, output.headers[_cd]],
    [_CE]: [, output.headers[_ce]],
    [_CL]: [, output.headers[_cl]],
    [_CR]: [, output.headers[_cr]],
    [_CT]: [, output.headers[_ct]],
    [_E]: [() => void 0 !== output.headers[_e], () => expectNonNull(parseRfc7231DateTime(output.headers[_e]))],
    [_ES]: [, output.headers[_ex]],
    [_WRL]: [, output.headers[_xawrl]],
    [_SSE]: [, output.headers[_xasse]],
    [_SSECA]: [, output.headers[_xasseca]],
    [_SSECKMD]: [, output.headers[_xasseckm]],
    [_SSEKMSKI]: [, output.headers[_xasseakki]],
    [_BKE]: [() => void 0 !== output.headers[_xassebke], () => parseBoolean(output.headers[_xassebke])],
    [_SC]: [, output.headers[_xasc]],
    [_RC]: [, output.headers[_xarc]],
    [_RS]: [, output.headers[_xars]],
    [_PC]: [() => void 0 !== output.headers[_xampc], () => strictParseInt32(output.headers[_xampc])],
    [_TC]: [() => void 0 !== output.headers[_xatc], () => strictParseInt32(output.headers[_xatc])],
    [_OLM]: [, output.headers[_xaolm]],
    [_OLRUD]: [
      () => void 0 !== output.headers[_xaolrud],
      () => expectNonNull(parseRfc3339DateTimeWithOffset(output.headers[_xaolrud]))
    ],
    [_OLLHS]: [, output.headers[_xaollh]],
    Metadata: [
      ,
      Object.keys(output.headers).filter((header) => header.startsWith("x-amz-meta-")).reduce((acc, header) => {
        acc[header.substring(11)] = output.headers[header];
        return acc;
      }, {})
    ]
  });
  const data = output.body;
  context.sdkStreamMixin(data);
  contents.Body = data;
  return contents;
};
var de_ListBucketsCommand = async (output, context) => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents = map({
    $metadata: deserializeMetadata2(output)
  });
  const data = expectNonNull(expectObject(await parseXmlBody(output.body, context)), "body");
  if (data.Buckets === "") {
    contents[_Bu] = [];
  } else if (data[_Bu] != null && data[_Bu][_B] != null) {
    contents[_Bu] = de_Buckets(getArrayIfSingleItem(data[_Bu][_B]), context);
  }
  if (data[_O] != null) {
    contents[_O] = de_Owner(data[_O], context);
  }
  return contents;
};
var de_ListObjectsV2Command = async (output, context) => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents = map({
    $metadata: deserializeMetadata2(output),
    [_RC]: [, output.headers[_xarc]]
  });
  const data = expectNonNull(expectObject(await parseXmlBody(output.body, context)), "body");
  if (data.CommonPrefixes === "") {
    contents[_CP] = [];
  } else if (data[_CP] != null) {
    contents[_CP] = de_CommonPrefixList(getArrayIfSingleItem(data[_CP]), context);
  }
  if (data.Contents === "") {
    contents[_Co] = [];
  } else if (data[_Co] != null) {
    contents[_Co] = de_ObjectList(getArrayIfSingleItem(data[_Co]), context);
  }
  if (data[_CTo] != null) {
    contents[_CTo] = expectString(data[_CTo]);
  }
  if (data[_D] != null) {
    contents[_D] = expectString(data[_D]);
  }
  if (data[_ET] != null) {
    contents[_ET] = expectString(data[_ET]);
  }
  if (data[_IT] != null) {
    contents[_IT] = parseBoolean(data[_IT]);
  }
  if (data[_KC] != null) {
    contents[_KC] = strictParseInt32(data[_KC]);
  }
  if (data[_MK] != null) {
    contents[_MK] = strictParseInt32(data[_MK]);
  }
  if (data[_N] != null) {
    contents[_N] = expectString(data[_N]);
  }
  if (data[_NCT] != null) {
    contents[_NCT] = expectString(data[_NCT]);
  }
  if (data[_P] != null) {
    contents[_P] = expectString(data[_P]);
  }
  if (data[_SA] != null) {
    contents[_SA] = expectString(data[_SA]);
  }
  return contents;
};
var de_PutObjectCommand = async (output, context) => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return de_CommandError(output, context);
  }
  const contents = map({
    $metadata: deserializeMetadata2(output),
    [_Exp]: [, output.headers[_xae]],
    [_ETa]: [, output.headers[_eta]],
    [_CCRC]: [, output.headers[_xacc]],
    [_CCRCC]: [, output.headers[_xacc_]],
    [_CSHA]: [, output.headers[_xacs]],
    [_CSHAh]: [, output.headers[_xacs_]],
    [_SSE]: [, output.headers[_xasse]],
    [_VI]: [, output.headers[_xavi]],
    [_SSECA]: [, output.headers[_xasseca]],
    [_SSECKMD]: [, output.headers[_xasseckm]],
    [_SSEKMSKI]: [, output.headers[_xasseakki]],
    [_SSEKMSEC]: [, output.headers[_xassec]],
    [_BKE]: [() => void 0 !== output.headers[_xassebke], () => parseBoolean(output.headers[_xassebke])],
    [_RC]: [, output.headers[_xarc]]
  });
  await collectBody(output.body, context);
  return contents;
};
var de_CommandError = async (output, context) => {
  const parsedOutput = {
    ...output,
    body: await parseXmlErrorBody(output.body, context)
  };
  const errorCode = loadRestXmlErrorCode(output, parsedOutput.body);
  switch (errorCode) {
    case "NoSuchUpload":
    case "com.amazonaws.s3#NoSuchUpload":
      throw await de_NoSuchUploadRes(parsedOutput, context);
    case "ObjectNotInActiveTierError":
    case "com.amazonaws.s3#ObjectNotInActiveTierError":
      throw await de_ObjectNotInActiveTierErrorRes(parsedOutput, context);
    case "BucketAlreadyExists":
    case "com.amazonaws.s3#BucketAlreadyExists":
      throw await de_BucketAlreadyExistsRes(parsedOutput, context);
    case "BucketAlreadyOwnedByYou":
    case "com.amazonaws.s3#BucketAlreadyOwnedByYou":
      throw await de_BucketAlreadyOwnedByYouRes(parsedOutput, context);
    case "NoSuchBucket":
    case "com.amazonaws.s3#NoSuchBucket":
      throw await de_NoSuchBucketRes(parsedOutput, context);
    case "InvalidObjectState":
    case "com.amazonaws.s3#InvalidObjectState":
      throw await de_InvalidObjectStateRes(parsedOutput, context);
    case "NoSuchKey":
    case "com.amazonaws.s3#NoSuchKey":
      throw await de_NoSuchKeyRes(parsedOutput, context);
    case "NotFound":
    case "com.amazonaws.s3#NotFound":
      throw await de_NotFoundRes(parsedOutput, context);
    case "ObjectAlreadyInActiveTierError":
    case "com.amazonaws.s3#ObjectAlreadyInActiveTierError":
      throw await de_ObjectAlreadyInActiveTierErrorRes(parsedOutput, context);
    default:
      const parsedBody = parsedOutput.body;
      return throwDefaultError2({
        output,
        parsedBody,
        errorCode
      });
  }
};
var throwDefaultError2 = withBaseException(S3ServiceException);
var de_BucketAlreadyExistsRes = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  const exception = new BucketAlreadyExists({
    $metadata: deserializeMetadata2(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
var de_BucketAlreadyOwnedByYouRes = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  const exception = new BucketAlreadyOwnedByYou({
    $metadata: deserializeMetadata2(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
var de_InvalidObjectStateRes = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data[_AT] != null) {
    contents[_AT] = expectString(data[_AT]);
  }
  if (data[_SC] != null) {
    contents[_SC] = expectString(data[_SC]);
  }
  const exception = new InvalidObjectState({
    $metadata: deserializeMetadata2(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
var de_NoSuchBucketRes = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  const exception = new NoSuchBucket({
    $metadata: deserializeMetadata2(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
var de_NoSuchKeyRes = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  const exception = new NoSuchKey({
    $metadata: deserializeMetadata2(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
var de_NoSuchUploadRes = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  const exception = new NoSuchUpload({
    $metadata: deserializeMetadata2(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
var de_NotFoundRes = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  const exception = new NotFound({
    $metadata: deserializeMetadata2(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
var de_ObjectAlreadyInActiveTierErrorRes = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  const exception = new ObjectAlreadyInActiveTierError({
    $metadata: deserializeMetadata2(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
var de_ObjectNotInActiveTierErrorRes = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  const exception = new ObjectNotInActiveTierError({
    $metadata: deserializeMetadata2(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
var se_BucketInfo = (input, context) => {
  const bn2 = new XmlNode(_BI);
  bn2.cc(input, _DR);
  if (input[_Ty] != null) {
    bn2.c(XmlNode.of(_BT, input[_Ty]).n(_Ty));
  }
  return bn2;
};
var se_CreateBucketConfiguration = (input, context) => {
  const bn2 = new XmlNode(_CBC);
  if (input[_LC] != null) {
    bn2.c(XmlNode.of(_BLCu, input[_LC]).n(_LC));
  }
  if (input[_L] != null) {
    bn2.c(se_LocationInfo(input[_L], context).n(_L));
  }
  if (input[_B] != null) {
    bn2.c(se_BucketInfo(input[_B], context).n(_B));
  }
  return bn2;
};
var se_LocationInfo = (input, context) => {
  const bn2 = new XmlNode(_LI);
  if (input[_Ty] != null) {
    bn2.c(XmlNode.of(_LT, input[_Ty]).n(_Ty));
  }
  if (input[_N] != null) {
    bn2.c(XmlNode.of(_LNAS, input[_N]).n(_N));
  }
  return bn2;
};
var de_Bucket = (output, context) => {
  const contents = {};
  if (output[_N] != null) {
    contents[_N] = expectString(output[_N]);
  }
  if (output[_CDr] != null) {
    contents[_CDr] = expectNonNull(parseRfc3339DateTimeWithOffset(output[_CDr]));
  }
  return contents;
};
var de_Buckets = (output, context) => {
  return (output || []).filter((e2) => e2 != null).map((entry) => {
    return de_Bucket(entry, context);
  });
};
var de_ChecksumAlgorithmList = (output, context) => {
  return (output || []).filter((e2) => e2 != null).map((entry) => {
    return expectString(entry);
  });
};
var de_CommonPrefix = (output, context) => {
  const contents = {};
  if (output[_P] != null) {
    contents[_P] = expectString(output[_P]);
  }
  return contents;
};
var de_CommonPrefixList = (output, context) => {
  return (output || []).filter((e2) => e2 != null).map((entry) => {
    return de_CommonPrefix(entry, context);
  });
};
var de__Object = (output, context) => {
  const contents = {};
  if (output[_K] != null) {
    contents[_K] = expectString(output[_K]);
  }
  if (output[_LM] != null) {
    contents[_LM] = expectNonNull(parseRfc3339DateTimeWithOffset(output[_LM]));
  }
  if (output[_ETa] != null) {
    contents[_ETa] = expectString(output[_ETa]);
  }
  if (output.ChecksumAlgorithm === "") {
    contents[_CA] = [];
  } else if (output[_CA] != null) {
    contents[_CA] = de_ChecksumAlgorithmList(getArrayIfSingleItem(output[_CA]), context);
  }
  if (output[_Si] != null) {
    contents[_Si] = strictParseLong(output[_Si]);
  }
  if (output[_SC] != null) {
    contents[_SC] = expectString(output[_SC]);
  }
  if (output[_O] != null) {
    contents[_O] = de_Owner(output[_O], context);
  }
  if (output[_RSe] != null) {
    contents[_RSe] = de_RestoreStatus(output[_RSe], context);
  }
  return contents;
};
var de_ObjectList = (output, context) => {
  return (output || []).filter((e2) => e2 != null).map((entry) => {
    return de__Object(entry, context);
  });
};
var de_Owner = (output, context) => {
  const contents = {};
  if (output[_DN] != null) {
    contents[_DN] = expectString(output[_DN]);
  }
  if (output[_ID_] != null) {
    contents[_ID_] = expectString(output[_ID_]);
  }
  return contents;
};
var de_RestoreStatus = (output, context) => {
  const contents = {};
  if (output[_IRIP] != null) {
    contents[_IRIP] = parseBoolean(output[_IRIP]);
  }
  if (output[_RED] != null) {
    contents[_RED] = expectNonNull(parseRfc3339DateTimeWithOffset(output[_RED]));
  }
  return contents;
};
var de_SessionCredentials = (output, context) => {
  const contents = {};
  if (output[_AKI] != null) {
    contents[_AKI] = expectString(output[_AKI]);
  }
  if (output[_SAK] != null) {
    contents[_SAK] = expectString(output[_SAK]);
  }
  if (output[_ST] != null) {
    contents[_ST] = expectString(output[_ST]);
  }
  if (output[_Exp] != null) {
    contents[_Exp] = expectNonNull(parseRfc3339DateTimeWithOffset(output[_Exp]));
  }
  return contents;
};
var deserializeMetadata2 = (output) => ({
  httpStatusCode: output.statusCode,
  requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
  extendedRequestId: output.headers["x-amz-id-2"],
  cfId: output.headers["x-amz-cf-id"]
});
var isSerializableHeaderValue = (value) => value !== void 0 && value !== null && value !== "" && (!Object.getOwnPropertyNames(value).includes("length") || value.length != 0) && (!Object.getOwnPropertyNames(value).includes("size") || value.size != 0);
var _ACL = "ACL";
var _AKI = "AccessKeyId";
var _AR = "AcceptRanges";
var _AT = "AccessTier";
var _B = "Bucket";
var _BGR = "BypassGovernanceRetention";
var _BI = "BucketInfo";
var _BKE = "BucketKeyEnabled";
var _BLCu = "BucketLocationConstraint";
var _BT = "BucketType";
var _Bu = "Buckets";
var _C = "Credentials";
var _CA = "ChecksumAlgorithm";
var _CBC = "CreateBucketConfiguration";
var _CC = "CacheControl";
var _CCRC = "ChecksumCRC32";
var _CCRCC = "ChecksumCRC32C";
var _CD = "ContentDisposition";
var _CDr = "CreationDate";
var _CE = "ContentEncoding";
var _CL = "ContentLanguage";
var _CLo = "ContentLength";
var _CM = "ChecksumMode";
var _CMD = "ContentMD5";
var _CP = "CommonPrefixes";
var _CR = "ContentRange";
var _CSHA = "ChecksumSHA1";
var _CSHAh = "ChecksumSHA256";
var _CT = "ContentType";
var _CTo = "ContinuationToken";
var _Co = "Contents";
var _D = "Delimiter";
var _DM = "DeleteMarker";
var _DN = "DisplayName";
var _DR = "DataRedundancy";
var _E = "Expires";
var _EBO = "ExpectedBucketOwner";
var _ES = "ExpiresString";
var _ET = "EncodingType";
var _ETa = "ETag";
var _Exp = "Expiration";
var _FO = "FetchOwner";
var _GFC = "GrantFullControl";
var _GR = "GrantRead";
var _GRACP = "GrantReadACP";
var _GW = "GrantWrite";
var _GWACP = "GrantWriteACP";
var _ID_ = "ID";
var _IM = "IfMatch";
var _IMS = "IfModifiedSince";
var _INM = "IfNoneMatch";
var _IRIP = "IsRestoreInProgress";
var _IT = "IsTruncated";
var _IUS = "IfUnmodifiedSince";
var _K = "Key";
var _KC = "KeyCount";
var _L = "Location";
var _LC = "LocationConstraint";
var _LI = "LocationInfo";
var _LM = "LastModified";
var _LNAS = "LocationNameAsString";
var _LT = "LocationType";
var _MFA = "MFA";
var _MK = "MaxKeys";
var _MM = "MissingMeta";
var _N = "Name";
var _NCT = "NextContinuationToken";
var _O = "Owner";
var _OLEFB = "ObjectLockEnabledForBucket";
var _OLLHS = "ObjectLockLegalHoldStatus";
var _OLM = "ObjectLockMode";
var _OLRUD = "ObjectLockRetainUntilDate";
var _OO = "ObjectOwnership";
var _OOA = "OptionalObjectAttributes";
var _P = "Prefix";
var _PC = "PartsCount";
var _PN = "PartNumber";
var _R = "Range";
var _RC = "RequestCharged";
var _RCC = "ResponseCacheControl";
var _RCD = "ResponseContentDisposition";
var _RCE = "ResponseContentEncoding";
var _RCL = "ResponseContentLanguage";
var _RCT = "ResponseContentType";
var _RE = "ResponseExpires";
var _RED = "RestoreExpiryDate";
var _RP = "RequestPayer";
var _RS = "ReplicationStatus";
var _RSe = "RestoreStatus";
var _Re = "Restore";
var _SA = "StartAfter";
var _SAK = "SecretAccessKey";
var _SC = "StorageClass";
var _SM = "SessionMode";
var _SSE = "ServerSideEncryption";
var _SSECA = "SSECustomerAlgorithm";
var _SSECK = "SSECustomerKey";
var _SSECKMD = "SSECustomerKeyMD5";
var _SSEKMSEC = "SSEKMSEncryptionContext";
var _SSEKMSKI = "SSEKMSKeyId";
var _ST = "SessionToken";
var _Si = "Size";
var _T = "Tagging";
var _TC = "TagCount";
var _Ty = "Type";
var _VI = "VersionId";
var _WRL = "WebsiteRedirectLocation";
var _ar = "accept-ranges";
var _cc = "cache-control";
var _cd = "content-disposition";
var _ce = "content-encoding";
var _cl = "content-language";
var _cl_ = "content-length";
var _cm = "content-md5";
var _cr = "content-range";
var _ct = "content-type";
var _ct_ = "continuation-token";
var _de = "delimiter";
var _e = "expires";
var _et = "encoding-type";
var _eta = "etag";
var _ex = "expiresstring";
var _fo = "fetch-owner";
var _im = "if-match";
var _ims = "if-modified-since";
var _inm = "if-none-match";
var _ius = "if-unmodified-since";
var _lm = "last-modified";
var _lo = "location";
var _lt = "list-type";
var _mk = "max-keys";
var _pN = "partNumber";
var _pr = "prefix";
var _ra = "range";
var _rcc = "response-cache-control";
var _rcd = "response-content-disposition";
var _rce = "response-content-encoding";
var _rcl = "response-content-language";
var _rct = "response-content-type";
var _re = "response-expires";
var _s = "session";
var _sa = "start-after";
var _vI = "versionId";
var _ve = '<?xml version="1.0" encoding="UTF-8"?>';
var _xaa = "x-amz-acl";
var _xabgr = "x-amz-bypass-governance-retention";
var _xabole = "x-amz-bucket-object-lock-enabled";
var _xacc = "x-amz-checksum-crc32";
var _xacc_ = "x-amz-checksum-crc32c";
var _xacm = "x-amz-checksum-mode";
var _xacs = "x-amz-checksum-sha1";
var _xacs_ = "x-amz-checksum-sha256";
var _xacsm = "x-amz-create-session-mode";
var _xadm = "x-amz-delete-marker";
var _xae = "x-amz-expiration";
var _xaebo = "x-amz-expected-bucket-owner";
var _xagfc = "x-amz-grant-full-control";
var _xagr = "x-amz-grant-read";
var _xagra = "x-amz-grant-read-acp";
var _xagw = "x-amz-grant-write";
var _xagwa = "x-amz-grant-write-acp";
var _xam = "x-amz-mfa";
var _xamm = "x-amz-missing-meta";
var _xampc = "x-amz-mp-parts-count";
var _xaollh = "x-amz-object-lock-legal-hold";
var _xaolm = "x-amz-object-lock-mode";
var _xaolrud = "x-amz-object-lock-retain-until-date";
var _xaoo = "x-amz-object-ownership";
var _xaooa = "x-amz-optional-object-attributes";
var _xar = "x-amz-restore";
var _xarc = "x-amz-request-charged";
var _xarp = "x-amz-request-payer";
var _xars = "x-amz-replication-status";
var _xasc = "x-amz-storage-class";
var _xasca = "x-amz-sdk-checksum-algorithm";
var _xasse = "x-amz-server-side-encryption";
var _xasseakki = "x-amz-server-side-encryption-aws-kms-key-id";
var _xassebke = "x-amz-server-side-encryption-bucket-key-enabled";
var _xassec = "x-amz-server-side-encryption-context";
var _xasseca = "x-amz-server-side-encryption-customer-algorithm";
var _xasseck = "x-amz-server-side-encryption-customer-key";
var _xasseckm = "x-amz-server-side-encryption-customer-key-md5";
var _xat = "x-amz-tagging";
var _xatc = "x-amz-tagging-count";
var _xavi = "x-amz-version-id";
var _xawrl = "x-amz-website-redirect-location";
var _xi = "x-id";

// node_modules/@aws-sdk/client-s3/dist-es/commands/CreateSessionCommand.js
var CreateSessionCommand = class extends Command.classBuilder().ep({
  ...commonParams,
  DisableS3ExpressSessionAuth: { type: "staticContextParams", value: true },
  Bucket: { type: "contextParams", name: "Bucket" }
}).m(function(Command2, cs2, config, o2) {
  return [
    getSerdePlugin(config, this.serialize, this.deserialize),
    getEndpointPlugin(config, Command2.getEndpointParameterInstructions())
  ];
}).s("AmazonS3", "CreateSession", {}).n("S3Client", "CreateSessionCommand").f(void 0, CreateSessionOutputFilterSensitiveLog).ser(se_CreateSessionCommand).de(de_CreateSessionCommand).build() {
};

// node_modules/@aws-sdk/client-s3/package.json
var package_default = {
  name: "@aws-sdk/client-s3",
  description: "AWS SDK for JavaScript S3 Client for Node.js, Browser and React Native",
  version: "3.556.0",
  scripts: {
    build: "concurrently 'yarn:build:cjs' 'yarn:build:es' 'yarn:build:types'",
    "build:cjs": "node ../../scripts/compilation/inline client-s3",
    "build:es": "tsc -p tsconfig.es.json",
    "build:include:deps": "lerna run --scope $npm_package_name --include-dependencies build",
    "build:types": "tsc -p tsconfig.types.json",
    "build:types:downlevel": "downlevel-dts dist-types dist-types/ts3.4",
    clean: "rimraf ./dist-* && rimraf *.tsbuildinfo",
    "extract:docs": "api-extractor run --local",
    "generate:client": "node ../../scripts/generate-clients/single-service --solo s3",
    test: "yarn test:unit",
    "test:e2e": "yarn test:e2e:node && yarn test:e2e:browser",
    "test:e2e:browser": "ts-mocha test/**/*.browser.ispec.ts && karma start karma.conf.js",
    "test:e2e:node": "jest --c jest.config.e2e.js",
    "test:unit": "ts-mocha test/unit/**/*.spec.ts"
  },
  main: "./dist-cjs/index.js",
  types: "./dist-types/index.d.ts",
  module: "./dist-es/index.js",
  sideEffects: false,
  dependencies: {
    "@aws-crypto/sha1-browser": "3.0.0",
    "@aws-crypto/sha256-browser": "3.0.0",
    "@aws-crypto/sha256-js": "3.0.0",
    "@aws-sdk/client-sts": "3.556.0",
    "@aws-sdk/core": "3.556.0",
    "@aws-sdk/credential-provider-node": "3.556.0",
    "@aws-sdk/middleware-bucket-endpoint": "3.535.0",
    "@aws-sdk/middleware-expect-continue": "3.535.0",
    "@aws-sdk/middleware-flexible-checksums": "3.535.0",
    "@aws-sdk/middleware-host-header": "3.535.0",
    "@aws-sdk/middleware-location-constraint": "3.535.0",
    "@aws-sdk/middleware-logger": "3.535.0",
    "@aws-sdk/middleware-recursion-detection": "3.535.0",
    "@aws-sdk/middleware-sdk-s3": "3.556.0",
    "@aws-sdk/middleware-signing": "3.556.0",
    "@aws-sdk/middleware-ssec": "3.537.0",
    "@aws-sdk/middleware-user-agent": "3.540.0",
    "@aws-sdk/region-config-resolver": "3.535.0",
    "@aws-sdk/signature-v4-multi-region": "3.556.0",
    "@aws-sdk/types": "3.535.0",
    "@aws-sdk/util-endpoints": "3.540.0",
    "@aws-sdk/util-user-agent-browser": "3.535.0",
    "@aws-sdk/util-user-agent-node": "3.535.0",
    "@aws-sdk/xml-builder": "3.535.0",
    "@smithy/config-resolver": "^2.2.0",
    "@smithy/core": "^1.4.2",
    "@smithy/eventstream-serde-browser": "^2.2.0",
    "@smithy/eventstream-serde-config-resolver": "^2.2.0",
    "@smithy/eventstream-serde-node": "^2.2.0",
    "@smithy/fetch-http-handler": "^2.5.0",
    "@smithy/hash-blob-browser": "^2.2.0",
    "@smithy/hash-node": "^2.2.0",
    "@smithy/hash-stream-node": "^2.2.0",
    "@smithy/invalid-dependency": "^2.2.0",
    "@smithy/md5-js": "^2.2.0",
    "@smithy/middleware-content-length": "^2.2.0",
    "@smithy/middleware-endpoint": "^2.5.1",
    "@smithy/middleware-retry": "^2.3.1",
    "@smithy/middleware-serde": "^2.3.0",
    "@smithy/middleware-stack": "^2.2.0",
    "@smithy/node-config-provider": "^2.3.0",
    "@smithy/node-http-handler": "^2.5.0",
    "@smithy/protocol-http": "^3.3.0",
    "@smithy/smithy-client": "^2.5.1",
    "@smithy/types": "^2.12.0",
    "@smithy/url-parser": "^2.2.0",
    "@smithy/util-base64": "^2.3.0",
    "@smithy/util-body-length-browser": "^2.2.0",
    "@smithy/util-body-length-node": "^2.3.0",
    "@smithy/util-defaults-mode-browser": "^2.2.1",
    "@smithy/util-defaults-mode-node": "^2.3.1",
    "@smithy/util-endpoints": "^1.2.0",
    "@smithy/util-retry": "^2.2.0",
    "@smithy/util-stream": "^2.2.0",
    "@smithy/util-utf8": "^2.3.0",
    "@smithy/util-waiter": "^2.2.0",
    tslib: "^2.6.2"
  },
  devDependencies: {
    "@aws-sdk/signature-v4-crt": "3.556.0",
    "@smithy/service-client-documentation-generator": "^2.2.0",
    "@tsconfig/node14": "1.0.3",
    "@types/chai": "^4.2.11",
    "@types/mocha": "^8.0.4",
    "@types/node": "^14.14.31",
    concurrently: "7.0.0",
    "downlevel-dts": "0.10.1",
    rimraf: "3.0.2",
    typescript: "~4.9.5"
  },
  engines: {
    node: ">=14.0.0"
  },
  typesVersions: {
    "<4.0": {
      "dist-types/*": [
        "dist-types/ts3.4/*"
      ]
    }
  },
  files: [
    "dist-*/**"
  ],
  author: {
    name: "AWS SDK for JavaScript Team",
    url: "https://aws.amazon.com/javascript/"
  },
  license: "Apache-2.0",
  browser: {
    "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.browser"
  },
  "react-native": {
    "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.native"
  },
  homepage: "https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-s3",
  repository: {
    type: "git",
    url: "https://github.com/aws/aws-sdk-js-v3.git",
    directory: "clients/client-s3"
  }
};

// node_modules/@aws-sdk/client-s3/dist-es/runtimeConfig.browser.js
var import_sha1_browser = __toESM(require_build4());
var import_sha256_browser = __toESM(require_build6());

// node_modules/@aws-sdk/util-user-agent-browser/dist-es/index.js
var import_bowser = __toESM(require_es5());
var defaultUserAgent = ({ serviceId, clientVersion }) => async () => {
  const parsedUA = typeof window !== "undefined" && window?.navigator?.userAgent ? import_bowser.default.parse(window.navigator.userAgent) : void 0;
  const sections = [
    ["aws-sdk-js", clientVersion],
    ["ua", "2.0"],
    [`os/${parsedUA?.os?.name || "other"}`, parsedUA?.os?.version],
    ["lang/js"],
    ["md/browser", `${parsedUA?.browser?.name ?? "unknown"}_${parsedUA?.browser?.version ?? "unknown"}`]
  ];
  if (serviceId) {
    sections.push([`api/${serviceId}`, clientVersion]);
  }
  return sections;
};

// node_modules/@smithy/eventstream-codec/dist-es/EventStreamCodec.js
var import_crc322 = __toESM(require_build7());

// node_modules/@smithy/eventstream-codec/dist-es/Int64.js
var Int642 = class _Int64 {
  constructor(bytes) {
    this.bytes = bytes;
    if (bytes.byteLength !== 8) {
      throw new Error("Int64 buffers must be exactly 8 bytes");
    }
  }
  static fromNumber(number) {
    if (number > 9223372036854776e3 || number < -9223372036854776e3) {
      throw new Error(`${number} is too large (or, if negative, too small) to represent as an Int64`);
    }
    const bytes = new Uint8Array(8);
    for (let i2 = 7, remaining = Math.abs(Math.round(number)); i2 > -1 && remaining > 0; i2--, remaining /= 256) {
      bytes[i2] = remaining;
    }
    if (number < 0) {
      negate2(bytes);
    }
    return new _Int64(bytes);
  }
  valueOf() {
    const bytes = this.bytes.slice(0);
    const negative = bytes[0] & 128;
    if (negative) {
      negate2(bytes);
    }
    return parseInt(toHex(bytes), 16) * (negative ? -1 : 1);
  }
  toString() {
    return String(this.valueOf());
  }
};
function negate2(bytes) {
  for (let i2 = 0; i2 < 8; i2++) {
    bytes[i2] ^= 255;
  }
  for (let i2 = 7; i2 > -1; i2--) {
    bytes[i2]++;
    if (bytes[i2] !== 0)
      break;
  }
}

// node_modules/@smithy/eventstream-codec/dist-es/HeaderMarshaller.js
var HeaderMarshaller = class {
  constructor(toUtf82, fromUtf82) {
    this.toUtf8 = toUtf82;
    this.fromUtf8 = fromUtf82;
  }
  format(headers) {
    const chunks = [];
    for (const headerName of Object.keys(headers)) {
      const bytes = this.fromUtf8(headerName);
      chunks.push(Uint8Array.from([bytes.byteLength]), bytes, this.formatHeaderValue(headers[headerName]));
    }
    const out = new Uint8Array(chunks.reduce((carry, bytes) => carry + bytes.byteLength, 0));
    let position = 0;
    for (const chunk of chunks) {
      out.set(chunk, position);
      position += chunk.byteLength;
    }
    return out;
  }
  formatHeaderValue(header) {
    switch (header.type) {
      case "boolean":
        return Uint8Array.from([header.value ? 0 : 1]);
      case "byte":
        return Uint8Array.from([2, header.value]);
      case "short":
        const shortView = new DataView(new ArrayBuffer(3));
        shortView.setUint8(0, 3);
        shortView.setInt16(1, header.value, false);
        return new Uint8Array(shortView.buffer);
      case "integer":
        const intView = new DataView(new ArrayBuffer(5));
        intView.setUint8(0, 4);
        intView.setInt32(1, header.value, false);
        return new Uint8Array(intView.buffer);
      case "long":
        const longBytes = new Uint8Array(9);
        longBytes[0] = 5;
        longBytes.set(header.value.bytes, 1);
        return longBytes;
      case "binary":
        const binView = new DataView(new ArrayBuffer(3 + header.value.byteLength));
        binView.setUint8(0, 6);
        binView.setUint16(1, header.value.byteLength, false);
        const binBytes = new Uint8Array(binView.buffer);
        binBytes.set(header.value, 3);
        return binBytes;
      case "string":
        const utf8Bytes = this.fromUtf8(header.value);
        const strView = new DataView(new ArrayBuffer(3 + utf8Bytes.byteLength));
        strView.setUint8(0, 7);
        strView.setUint16(1, utf8Bytes.byteLength, false);
        const strBytes = new Uint8Array(strView.buffer);
        strBytes.set(utf8Bytes, 3);
        return strBytes;
      case "timestamp":
        const tsBytes = new Uint8Array(9);
        tsBytes[0] = 8;
        tsBytes.set(Int642.fromNumber(header.value.valueOf()).bytes, 1);
        return tsBytes;
      case "uuid":
        if (!UUID_PATTERN2.test(header.value)) {
          throw new Error(`Invalid UUID received: ${header.value}`);
        }
        const uuidBytes = new Uint8Array(17);
        uuidBytes[0] = 9;
        uuidBytes.set(fromHex(header.value.replace(/\-/g, "")), 1);
        return uuidBytes;
    }
  }
  parse(headers) {
    const out = {};
    let position = 0;
    while (position < headers.byteLength) {
      const nameLength = headers.getUint8(position++);
      const name = this.toUtf8(new Uint8Array(headers.buffer, headers.byteOffset + position, nameLength));
      position += nameLength;
      switch (headers.getUint8(position++)) {
        case 0:
          out[name] = {
            type: BOOLEAN_TAG,
            value: true
          };
          break;
        case 1:
          out[name] = {
            type: BOOLEAN_TAG,
            value: false
          };
          break;
        case 2:
          out[name] = {
            type: BYTE_TAG,
            value: headers.getInt8(position++)
          };
          break;
        case 3:
          out[name] = {
            type: SHORT_TAG,
            value: headers.getInt16(position, false)
          };
          position += 2;
          break;
        case 4:
          out[name] = {
            type: INT_TAG,
            value: headers.getInt32(position, false)
          };
          position += 4;
          break;
        case 5:
          out[name] = {
            type: LONG_TAG,
            value: new Int642(new Uint8Array(headers.buffer, headers.byteOffset + position, 8))
          };
          position += 8;
          break;
        case 6:
          const binaryLength = headers.getUint16(position, false);
          position += 2;
          out[name] = {
            type: BINARY_TAG,
            value: new Uint8Array(headers.buffer, headers.byteOffset + position, binaryLength)
          };
          position += binaryLength;
          break;
        case 7:
          const stringLength = headers.getUint16(position, false);
          position += 2;
          out[name] = {
            type: STRING_TAG,
            value: this.toUtf8(new Uint8Array(headers.buffer, headers.byteOffset + position, stringLength))
          };
          position += stringLength;
          break;
        case 8:
          out[name] = {
            type: TIMESTAMP_TAG,
            value: new Date(new Int642(new Uint8Array(headers.buffer, headers.byteOffset + position, 8)).valueOf())
          };
          position += 8;
          break;
        case 9:
          const uuidBytes = new Uint8Array(headers.buffer, headers.byteOffset + position, 16);
          position += 16;
          out[name] = {
            type: UUID_TAG,
            value: `${toHex(uuidBytes.subarray(0, 4))}-${toHex(uuidBytes.subarray(4, 6))}-${toHex(uuidBytes.subarray(6, 8))}-${toHex(uuidBytes.subarray(8, 10))}-${toHex(uuidBytes.subarray(10))}`
          };
          break;
        default:
          throw new Error(`Unrecognized header type tag`);
      }
    }
    return out;
  }
};
var HEADER_VALUE_TYPE2;
(function(HEADER_VALUE_TYPE3) {
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["boolTrue"] = 0] = "boolTrue";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["boolFalse"] = 1] = "boolFalse";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["byte"] = 2] = "byte";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["short"] = 3] = "short";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["integer"] = 4] = "integer";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["long"] = 5] = "long";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["byteArray"] = 6] = "byteArray";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["string"] = 7] = "string";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["timestamp"] = 8] = "timestamp";
  HEADER_VALUE_TYPE3[HEADER_VALUE_TYPE3["uuid"] = 9] = "uuid";
})(HEADER_VALUE_TYPE2 || (HEADER_VALUE_TYPE2 = {}));
var BOOLEAN_TAG = "boolean";
var BYTE_TAG = "byte";
var SHORT_TAG = "short";
var INT_TAG = "integer";
var LONG_TAG = "long";
var BINARY_TAG = "binary";
var STRING_TAG = "string";
var TIMESTAMP_TAG = "timestamp";
var UUID_TAG = "uuid";
var UUID_PATTERN2 = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

// node_modules/@smithy/eventstream-codec/dist-es/splitMessage.js
var import_crc32 = __toESM(require_build7());
var PRELUDE_MEMBER_LENGTH = 4;
var PRELUDE_LENGTH = PRELUDE_MEMBER_LENGTH * 2;
var CHECKSUM_LENGTH = 4;
var MINIMUM_MESSAGE_LENGTH = PRELUDE_LENGTH + CHECKSUM_LENGTH * 2;
function splitMessage({ byteLength, byteOffset, buffer }) {
  if (byteLength < MINIMUM_MESSAGE_LENGTH) {
    throw new Error("Provided message too short to accommodate event stream message overhead");
  }
  const view = new DataView(buffer, byteOffset, byteLength);
  const messageLength = view.getUint32(0, false);
  if (byteLength !== messageLength) {
    throw new Error("Reported message length does not match received message length");
  }
  const headerLength = view.getUint32(PRELUDE_MEMBER_LENGTH, false);
  const expectedPreludeChecksum = view.getUint32(PRELUDE_LENGTH, false);
  const expectedMessageChecksum = view.getUint32(byteLength - CHECKSUM_LENGTH, false);
  const checksummer = new import_crc32.Crc32().update(new Uint8Array(buffer, byteOffset, PRELUDE_LENGTH));
  if (expectedPreludeChecksum !== checksummer.digest()) {
    throw new Error(`The prelude checksum specified in the message (${expectedPreludeChecksum}) does not match the calculated CRC32 checksum (${checksummer.digest()})`);
  }
  checksummer.update(new Uint8Array(buffer, byteOffset + PRELUDE_LENGTH, byteLength - (PRELUDE_LENGTH + CHECKSUM_LENGTH)));
  if (expectedMessageChecksum !== checksummer.digest()) {
    throw new Error(`The message checksum (${checksummer.digest()}) did not match the expected value of ${expectedMessageChecksum}`);
  }
  return {
    headers: new DataView(buffer, byteOffset + PRELUDE_LENGTH + CHECKSUM_LENGTH, headerLength),
    body: new Uint8Array(buffer, byteOffset + PRELUDE_LENGTH + CHECKSUM_LENGTH + headerLength, messageLength - headerLength - (PRELUDE_LENGTH + CHECKSUM_LENGTH + CHECKSUM_LENGTH))
  };
}

// node_modules/@smithy/eventstream-codec/dist-es/EventStreamCodec.js
var EventStreamCodec = class {
  constructor(toUtf82, fromUtf82) {
    this.headerMarshaller = new HeaderMarshaller(toUtf82, fromUtf82);
    this.messageBuffer = [];
    this.isEndOfStream = false;
  }
  feed(message) {
    this.messageBuffer.push(this.decode(message));
  }
  endOfStream() {
    this.isEndOfStream = true;
  }
  getMessage() {
    const message = this.messageBuffer.pop();
    const isEndOfStream = this.isEndOfStream;
    return {
      getMessage() {
        return message;
      },
      isEndOfStream() {
        return isEndOfStream;
      }
    };
  }
  getAvailableMessages() {
    const messages = this.messageBuffer;
    this.messageBuffer = [];
    const isEndOfStream = this.isEndOfStream;
    return {
      getMessages() {
        return messages;
      },
      isEndOfStream() {
        return isEndOfStream;
      }
    };
  }
  encode({ headers: rawHeaders, body }) {
    const headers = this.headerMarshaller.format(rawHeaders);
    const length = headers.byteLength + body.byteLength + 16;
    const out = new Uint8Array(length);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const checksum = new import_crc322.Crc32();
    view.setUint32(0, length, false);
    view.setUint32(4, headers.byteLength, false);
    view.setUint32(8, checksum.update(out.subarray(0, 8)).digest(), false);
    out.set(headers, 12);
    out.set(body, headers.byteLength + 12);
    view.setUint32(length - 4, checksum.update(out.subarray(8, length - 4)).digest(), false);
    return out;
  }
  decode(message) {
    const { headers, body } = splitMessage(message);
    return { headers: this.headerMarshaller.parse(headers), body };
  }
  formatHeaders(rawHeaders) {
    return this.headerMarshaller.format(rawHeaders);
  }
};

// node_modules/@smithy/eventstream-codec/dist-es/MessageDecoderStream.js
var MessageDecoderStream = class {
  constructor(options) {
    this.options = options;
  }
  [Symbol.asyncIterator]() {
    return this.asyncIterator();
  }
  async *asyncIterator() {
    for await (const bytes of this.options.inputStream) {
      const decoded = this.options.decoder.decode(bytes);
      yield decoded;
    }
  }
};

// node_modules/@smithy/eventstream-codec/dist-es/MessageEncoderStream.js
var MessageEncoderStream = class {
  constructor(options) {
    this.options = options;
  }
  [Symbol.asyncIterator]() {
    return this.asyncIterator();
  }
  async *asyncIterator() {
    for await (const msg of this.options.messageStream) {
      const encoded = this.options.encoder.encode(msg);
      yield encoded;
    }
    if (this.options.includeEndFrame) {
      yield new Uint8Array(0);
    }
  }
};

// node_modules/@smithy/eventstream-codec/dist-es/SmithyMessageDecoderStream.js
var SmithyMessageDecoderStream = class {
  constructor(options) {
    this.options = options;
  }
  [Symbol.asyncIterator]() {
    return this.asyncIterator();
  }
  async *asyncIterator() {
    for await (const message of this.options.messageStream) {
      const deserialized = await this.options.deserializer(message);
      if (deserialized === void 0)
        continue;
      yield deserialized;
    }
  }
};

// node_modules/@smithy/eventstream-codec/dist-es/SmithyMessageEncoderStream.js
var SmithyMessageEncoderStream = class {
  constructor(options) {
    this.options = options;
  }
  [Symbol.asyncIterator]() {
    return this.asyncIterator();
  }
  async *asyncIterator() {
    for await (const chunk of this.options.inputStream) {
      const payloadBuf = this.options.serializer(chunk);
      yield payloadBuf;
    }
  }
};

// node_modules/@smithy/eventstream-serde-universal/dist-es/getChunkedStream.js
function getChunkedStream(source) {
  let currentMessageTotalLength = 0;
  let currentMessagePendingLength = 0;
  let currentMessage = null;
  let messageLengthBuffer = null;
  const allocateMessage = (size) => {
    if (typeof size !== "number") {
      throw new Error("Attempted to allocate an event message where size was not a number: " + size);
    }
    currentMessageTotalLength = size;
    currentMessagePendingLength = 4;
    currentMessage = new Uint8Array(size);
    const currentMessageView = new DataView(currentMessage.buffer);
    currentMessageView.setUint32(0, size, false);
  };
  const iterator = async function* () {
    const sourceIterator = source[Symbol.asyncIterator]();
    while (true) {
      const { value, done } = await sourceIterator.next();
      if (done) {
        if (!currentMessageTotalLength) {
          return;
        } else if (currentMessageTotalLength === currentMessagePendingLength) {
          yield currentMessage;
        } else {
          throw new Error("Truncated event message received.");
        }
        return;
      }
      const chunkLength = value.length;
      let currentOffset = 0;
      while (currentOffset < chunkLength) {
        if (!currentMessage) {
          const bytesRemaining = chunkLength - currentOffset;
          if (!messageLengthBuffer) {
            messageLengthBuffer = new Uint8Array(4);
          }
          const numBytesForTotal = Math.min(4 - currentMessagePendingLength, bytesRemaining);
          messageLengthBuffer.set(value.slice(currentOffset, currentOffset + numBytesForTotal), currentMessagePendingLength);
          currentMessagePendingLength += numBytesForTotal;
          currentOffset += numBytesForTotal;
          if (currentMessagePendingLength < 4) {
            break;
          }
          allocateMessage(new DataView(messageLengthBuffer.buffer).getUint32(0, false));
          messageLengthBuffer = null;
        }
        const numBytesToWrite = Math.min(currentMessageTotalLength - currentMessagePendingLength, chunkLength - currentOffset);
        currentMessage.set(value.slice(currentOffset, currentOffset + numBytesToWrite), currentMessagePendingLength);
        currentMessagePendingLength += numBytesToWrite;
        currentOffset += numBytesToWrite;
        if (currentMessageTotalLength && currentMessageTotalLength === currentMessagePendingLength) {
          yield currentMessage;
          currentMessage = null;
          currentMessageTotalLength = 0;
          currentMessagePendingLength = 0;
        }
      }
    }
  };
  return {
    [Symbol.asyncIterator]: iterator
  };
}

// node_modules/@smithy/eventstream-serde-universal/dist-es/getUnmarshalledStream.js
function getMessageUnmarshaller(deserializer, toUtf82) {
  return async function(message) {
    const { value: messageType } = message.headers[":message-type"];
    if (messageType === "error") {
      const unmodeledError = new Error(message.headers[":error-message"].value || "UnknownError");
      unmodeledError.name = message.headers[":error-code"].value;
      throw unmodeledError;
    } else if (messageType === "exception") {
      const code = message.headers[":exception-type"].value;
      const exception = { [code]: message };
      const deserializedException = await deserializer(exception);
      if (deserializedException.$unknown) {
        const error = new Error(toUtf82(message.body));
        error.name = code;
        throw error;
      }
      throw deserializedException[code];
    } else if (messageType === "event") {
      const event = {
        [message.headers[":event-type"].value]: message
      };
      const deserialized = await deserializer(event);
      if (deserialized.$unknown)
        return;
      return deserialized;
    } else {
      throw Error(`Unrecognizable event type: ${message.headers[":event-type"].value}`);
    }
  };
}

// node_modules/@smithy/eventstream-serde-universal/dist-es/EventStreamMarshaller.js
var EventStreamMarshaller = class {
  constructor({ utf8Encoder, utf8Decoder }) {
    this.eventStreamCodec = new EventStreamCodec(utf8Encoder, utf8Decoder);
    this.utfEncoder = utf8Encoder;
  }
  deserialize(body, deserializer) {
    const inputStream = getChunkedStream(body);
    return new SmithyMessageDecoderStream({
      messageStream: new MessageDecoderStream({ inputStream, decoder: this.eventStreamCodec }),
      deserializer: getMessageUnmarshaller(deserializer, this.utfEncoder)
    });
  }
  serialize(inputStream, serializer) {
    return new MessageEncoderStream({
      messageStream: new SmithyMessageEncoderStream({ inputStream, serializer }),
      encoder: this.eventStreamCodec,
      includeEndFrame: true
    });
  }
};

// node_modules/@smithy/eventstream-serde-browser/dist-es/utils.js
var readableStreamtoIterable = (readableStream) => ({
  [Symbol.asyncIterator]: async function* () {
    const reader = readableStream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
});
var iterableToReadableStream = (asyncIterable) => {
  const iterator = asyncIterable[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        return controller.close();
      }
      controller.enqueue(value);
    }
  });
};

// node_modules/@smithy/eventstream-serde-browser/dist-es/EventStreamMarshaller.js
var EventStreamMarshaller2 = class {
  constructor({ utf8Encoder, utf8Decoder }) {
    this.universalMarshaller = new EventStreamMarshaller({
      utf8Decoder,
      utf8Encoder
    });
  }
  deserialize(body, deserializer) {
    const bodyIterable = isReadableStream(body) ? readableStreamtoIterable(body) : body;
    return this.universalMarshaller.deserialize(bodyIterable, deserializer);
  }
  serialize(input, serializer) {
    const serialziedIterable = this.universalMarshaller.serialize(input, serializer);
    return typeof ReadableStream === "function" ? iterableToReadableStream(serialziedIterable) : serialziedIterable;
  }
};
var isReadableStream = (body) => typeof ReadableStream === "function" && body instanceof ReadableStream;

// node_modules/@smithy/eventstream-serde-browser/dist-es/provider.js
var eventStreamSerdeProvider = (options) => new EventStreamMarshaller2(options);

// node_modules/@smithy/chunked-blob-reader/dist-es/index.js
function blobReader(blob, onChunk, chunkSize = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.addEventListener("error", reject);
    fileReader.addEventListener("abort", reject);
    const size = blob.size;
    let totalBytesRead = 0;
    function read() {
      if (totalBytesRead >= size) {
        resolve();
        return;
      }
      fileReader.readAsArrayBuffer(blob.slice(totalBytesRead, Math.min(size, totalBytesRead + chunkSize)));
    }
    fileReader.addEventListener("load", (event) => {
      const result = event.target.result;
      onChunk(new Uint8Array(result));
      totalBytesRead += result.byteLength;
      read();
    });
    read();
  });
}

// node_modules/@smithy/hash-blob-browser/dist-es/index.js
var blobHasher = async function blobHasher2(hashCtor, blob) {
  const hash = new hashCtor();
  await blobReader(blob, (chunk) => {
    hash.update(chunk);
  });
  return hash.digest();
};

// node_modules/@smithy/invalid-dependency/dist-es/invalidProvider.js
var invalidProvider = (message) => () => Promise.reject(message);

// node_modules/@smithy/md5-js/dist-es/constants.js
var BLOCK_SIZE = 64;
var DIGEST_LENGTH = 16;
var INIT = [1732584193, 4023233417, 2562383102, 271733878];

// node_modules/@smithy/md5-js/dist-es/index.js
var Md5 = class {
  constructor() {
    this.reset();
  }
  update(sourceData) {
    if (isEmptyData(sourceData)) {
      return;
    } else if (this.finished) {
      throw new Error("Attempted to update an already finished hash.");
    }
    const data = convertToBuffer(sourceData);
    let position = 0;
    let { byteLength } = data;
    this.bytesHashed += byteLength;
    while (byteLength > 0) {
      this.buffer.setUint8(this.bufferLength++, data[position++]);
      byteLength--;
      if (this.bufferLength === BLOCK_SIZE) {
        this.hashBuffer();
        this.bufferLength = 0;
      }
    }
  }
  async digest() {
    if (!this.finished) {
      const { buffer, bufferLength: undecoratedLength, bytesHashed } = this;
      const bitsHashed = bytesHashed * 8;
      buffer.setUint8(this.bufferLength++, 128);
      if (undecoratedLength % BLOCK_SIZE >= BLOCK_SIZE - 8) {
        for (let i2 = this.bufferLength; i2 < BLOCK_SIZE; i2++) {
          buffer.setUint8(i2, 0);
        }
        this.hashBuffer();
        this.bufferLength = 0;
      }
      for (let i2 = this.bufferLength; i2 < BLOCK_SIZE - 8; i2++) {
        buffer.setUint8(i2, 0);
      }
      buffer.setUint32(BLOCK_SIZE - 8, bitsHashed >>> 0, true);
      buffer.setUint32(BLOCK_SIZE - 4, Math.floor(bitsHashed / 4294967296), true);
      this.hashBuffer();
      this.finished = true;
    }
    const out = new DataView(new ArrayBuffer(DIGEST_LENGTH));
    for (let i2 = 0; i2 < 4; i2++) {
      out.setUint32(i2 * 4, this.state[i2], true);
    }
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
  hashBuffer() {
    const { buffer, state } = this;
    let a2 = state[0], b2 = state[1], c2 = state[2], d2 = state[3];
    a2 = ff(a2, b2, c2, d2, buffer.getUint32(0, true), 7, 3614090360);
    d2 = ff(d2, a2, b2, c2, buffer.getUint32(4, true), 12, 3905402710);
    c2 = ff(c2, d2, a2, b2, buffer.getUint32(8, true), 17, 606105819);
    b2 = ff(b2, c2, d2, a2, buffer.getUint32(12, true), 22, 3250441966);
    a2 = ff(a2, b2, c2, d2, buffer.getUint32(16, true), 7, 4118548399);
    d2 = ff(d2, a2, b2, c2, buffer.getUint32(20, true), 12, 1200080426);
    c2 = ff(c2, d2, a2, b2, buffer.getUint32(24, true), 17, 2821735955);
    b2 = ff(b2, c2, d2, a2, buffer.getUint32(28, true), 22, 4249261313);
    a2 = ff(a2, b2, c2, d2, buffer.getUint32(32, true), 7, 1770035416);
    d2 = ff(d2, a2, b2, c2, buffer.getUint32(36, true), 12, 2336552879);
    c2 = ff(c2, d2, a2, b2, buffer.getUint32(40, true), 17, 4294925233);
    b2 = ff(b2, c2, d2, a2, buffer.getUint32(44, true), 22, 2304563134);
    a2 = ff(a2, b2, c2, d2, buffer.getUint32(48, true), 7, 1804603682);
    d2 = ff(d2, a2, b2, c2, buffer.getUint32(52, true), 12, 4254626195);
    c2 = ff(c2, d2, a2, b2, buffer.getUint32(56, true), 17, 2792965006);
    b2 = ff(b2, c2, d2, a2, buffer.getUint32(60, true), 22, 1236535329);
    a2 = gg(a2, b2, c2, d2, buffer.getUint32(4, true), 5, 4129170786);
    d2 = gg(d2, a2, b2, c2, buffer.getUint32(24, true), 9, 3225465664);
    c2 = gg(c2, d2, a2, b2, buffer.getUint32(44, true), 14, 643717713);
    b2 = gg(b2, c2, d2, a2, buffer.getUint32(0, true), 20, 3921069994);
    a2 = gg(a2, b2, c2, d2, buffer.getUint32(20, true), 5, 3593408605);
    d2 = gg(d2, a2, b2, c2, buffer.getUint32(40, true), 9, 38016083);
    c2 = gg(c2, d2, a2, b2, buffer.getUint32(60, true), 14, 3634488961);
    b2 = gg(b2, c2, d2, a2, buffer.getUint32(16, true), 20, 3889429448);
    a2 = gg(a2, b2, c2, d2, buffer.getUint32(36, true), 5, 568446438);
    d2 = gg(d2, a2, b2, c2, buffer.getUint32(56, true), 9, 3275163606);
    c2 = gg(c2, d2, a2, b2, buffer.getUint32(12, true), 14, 4107603335);
    b2 = gg(b2, c2, d2, a2, buffer.getUint32(32, true), 20, 1163531501);
    a2 = gg(a2, b2, c2, d2, buffer.getUint32(52, true), 5, 2850285829);
    d2 = gg(d2, a2, b2, c2, buffer.getUint32(8, true), 9, 4243563512);
    c2 = gg(c2, d2, a2, b2, buffer.getUint32(28, true), 14, 1735328473);
    b2 = gg(b2, c2, d2, a2, buffer.getUint32(48, true), 20, 2368359562);
    a2 = hh(a2, b2, c2, d2, buffer.getUint32(20, true), 4, 4294588738);
    d2 = hh(d2, a2, b2, c2, buffer.getUint32(32, true), 11, 2272392833);
    c2 = hh(c2, d2, a2, b2, buffer.getUint32(44, true), 16, 1839030562);
    b2 = hh(b2, c2, d2, a2, buffer.getUint32(56, true), 23, 4259657740);
    a2 = hh(a2, b2, c2, d2, buffer.getUint32(4, true), 4, 2763975236);
    d2 = hh(d2, a2, b2, c2, buffer.getUint32(16, true), 11, 1272893353);
    c2 = hh(c2, d2, a2, b2, buffer.getUint32(28, true), 16, 4139469664);
    b2 = hh(b2, c2, d2, a2, buffer.getUint32(40, true), 23, 3200236656);
    a2 = hh(a2, b2, c2, d2, buffer.getUint32(52, true), 4, 681279174);
    d2 = hh(d2, a2, b2, c2, buffer.getUint32(0, true), 11, 3936430074);
    c2 = hh(c2, d2, a2, b2, buffer.getUint32(12, true), 16, 3572445317);
    b2 = hh(b2, c2, d2, a2, buffer.getUint32(24, true), 23, 76029189);
    a2 = hh(a2, b2, c2, d2, buffer.getUint32(36, true), 4, 3654602809);
    d2 = hh(d2, a2, b2, c2, buffer.getUint32(48, true), 11, 3873151461);
    c2 = hh(c2, d2, a2, b2, buffer.getUint32(60, true), 16, 530742520);
    b2 = hh(b2, c2, d2, a2, buffer.getUint32(8, true), 23, 3299628645);
    a2 = ii(a2, b2, c2, d2, buffer.getUint32(0, true), 6, 4096336452);
    d2 = ii(d2, a2, b2, c2, buffer.getUint32(28, true), 10, 1126891415);
    c2 = ii(c2, d2, a2, b2, buffer.getUint32(56, true), 15, 2878612391);
    b2 = ii(b2, c2, d2, a2, buffer.getUint32(20, true), 21, 4237533241);
    a2 = ii(a2, b2, c2, d2, buffer.getUint32(48, true), 6, 1700485571);
    d2 = ii(d2, a2, b2, c2, buffer.getUint32(12, true), 10, 2399980690);
    c2 = ii(c2, d2, a2, b2, buffer.getUint32(40, true), 15, 4293915773);
    b2 = ii(b2, c2, d2, a2, buffer.getUint32(4, true), 21, 2240044497);
    a2 = ii(a2, b2, c2, d2, buffer.getUint32(32, true), 6, 1873313359);
    d2 = ii(d2, a2, b2, c2, buffer.getUint32(60, true), 10, 4264355552);
    c2 = ii(c2, d2, a2, b2, buffer.getUint32(24, true), 15, 2734768916);
    b2 = ii(b2, c2, d2, a2, buffer.getUint32(52, true), 21, 1309151649);
    a2 = ii(a2, b2, c2, d2, buffer.getUint32(16, true), 6, 4149444226);
    d2 = ii(d2, a2, b2, c2, buffer.getUint32(44, true), 10, 3174756917);
    c2 = ii(c2, d2, a2, b2, buffer.getUint32(8, true), 15, 718787259);
    b2 = ii(b2, c2, d2, a2, buffer.getUint32(36, true), 21, 3951481745);
    state[0] = a2 + state[0] & 4294967295;
    state[1] = b2 + state[1] & 4294967295;
    state[2] = c2 + state[2] & 4294967295;
    state[3] = d2 + state[3] & 4294967295;
  }
  reset() {
    this.state = Uint32Array.from(INIT);
    this.buffer = new DataView(new ArrayBuffer(BLOCK_SIZE));
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.finished = false;
  }
};
function cmn(q2, a2, b2, x2, s2, t2) {
  a2 = (a2 + q2 & 4294967295) + (x2 + t2 & 4294967295) & 4294967295;
  return (a2 << s2 | a2 >>> 32 - s2) + b2 & 4294967295;
}
function ff(a2, b2, c2, d2, x2, s2, t2) {
  return cmn(b2 & c2 | ~b2 & d2, a2, b2, x2, s2, t2);
}
function gg(a2, b2, c2, d2, x2, s2, t2) {
  return cmn(b2 & d2 | c2 & ~d2, a2, b2, x2, s2, t2);
}
function hh(a2, b2, c2, d2, x2, s2, t2) {
  return cmn(b2 ^ c2 ^ d2, a2, b2, x2, s2, t2);
}
function ii(a2, b2, c2, d2, x2, s2, t2) {
  return cmn(c2 ^ (b2 | ~d2), a2, b2, x2, s2, t2);
}
function isEmptyData(data) {
  if (typeof data === "string") {
    return data.length === 0;
  }
  return data.byteLength === 0;
}
function convertToBuffer(data) {
  if (typeof data === "string") {
    return fromUtf8(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
  }
  return new Uint8Array(data);
}

// node_modules/@smithy/util-body-length-browser/dist-es/calculateBodyLength.js
var TEXT_ENCODER = typeof TextEncoder == "function" ? new TextEncoder() : null;
var calculateBodyLength = (body) => {
  if (typeof body === "string") {
    if (TEXT_ENCODER) {
      return TEXT_ENCODER.encode(body).byteLength;
    }
    let len = body.length;
    for (let i2 = len - 1; i2 >= 0; i2--) {
      const code = body.charCodeAt(i2);
      if (code > 127 && code <= 2047)
        len++;
      else if (code > 2047 && code <= 65535)
        len += 2;
      if (code >= 56320 && code <= 57343)
        i2--;
    }
    return len;
  } else if (typeof body.byteLength === "number") {
    return body.byteLength;
  } else if (typeof body.size === "number") {
    return body.size;
  }
  throw new Error(`Body Length computation failed for ${body}`);
};

// node_modules/@aws-sdk/signature-v4-multi-region/dist-es/signature-v4-crt-container.js
var signatureV4CrtContainer = {
  CrtSignerV4: null
};

// node_modules/@aws-sdk/signature-v4-multi-region/dist-es/SignatureV4MultiRegion.js
var SignatureV4MultiRegion = class {
  constructor(options) {
    this.sigv4Signer = new SignatureV4S3Express(options);
    this.signerOptions = options;
  }
  async sign(requestToSign, options = {}) {
    if (options.signingRegion === "*") {
      if (this.signerOptions.runtime !== "node")
        throw new Error("This request requires signing with SigV4Asymmetric algorithm. It's only available in Node.js");
      return this.getSigv4aSigner().sign(requestToSign, options);
    }
    return this.sigv4Signer.sign(requestToSign, options);
  }
  async signWithCredentials(requestToSign, credentials, options = {}) {
    if (options.signingRegion === "*") {
      if (this.signerOptions.runtime !== "node")
        throw new Error("This request requires signing with SigV4Asymmetric algorithm. It's only available in Node.js");
      return this.getSigv4aSigner().signWithCredentials(requestToSign, credentials, options);
    }
    return this.sigv4Signer.signWithCredentials(requestToSign, credentials, options);
  }
  async presign(originalRequest, options = {}) {
    if (options.signingRegion === "*") {
      if (this.signerOptions.runtime !== "node")
        throw new Error("This request requires signing with SigV4Asymmetric algorithm. It's only available in Node.js");
      return this.getSigv4aSigner().presign(originalRequest, options);
    }
    return this.sigv4Signer.presign(originalRequest, options);
  }
  async presignWithCredentials(originalRequest, credentials, options = {}) {
    if (options.signingRegion === "*") {
      throw new Error("Method presignWithCredentials is not supported for [signingRegion=*].");
    }
    return this.sigv4Signer.presignWithCredentials(originalRequest, credentials, options);
  }
  getSigv4aSigner() {
    if (!this.sigv4aSigner) {
      let CrtSignerV4 = null;
      try {
        CrtSignerV4 = signatureV4CrtContainer.CrtSignerV4;
        if (typeof CrtSignerV4 !== "function")
          throw new Error();
      } catch (e2) {
        e2.message = `${e2.message}
Please check whether you have installed the "@aws-sdk/signature-v4-crt" package explicitly. 
You must also register the package by calling [require("@aws-sdk/signature-v4-crt");] or an ESM equivalent such as [import "@aws-sdk/signature-v4-crt";]. 
For more information please go to https://github.com/aws/aws-sdk-js-v3#functionality-requiring-aws-common-runtime-crt`;
        throw e2;
      }
      this.sigv4aSigner = new CrtSignerV4({
        ...this.signerOptions,
        signingAlgorithm: 1
      });
    }
    return this.sigv4aSigner;
  }
};

// node_modules/@aws-sdk/client-s3/dist-es/endpoint/ruleset.js
var ce = "required";
var cf = "type";
var cg = "conditions";
var ch = "fn";
var ci = "argv";
var cj = "ref";
var ck = "assign";
var cl = "url";
var cm = "properties";
var cn = "backend";
var co = "authSchemes";
var cp = "disableDoubleEncoding";
var cq = "signingName";
var cr = "signingRegion";
var cs = "headers";
var ct = "signingRegionSet";
var a = false;
var b = true;
var c = "isSet";
var d = "booleanEquals";
var e = "error";
var f = "aws.partition";
var g = "stringEquals";
var h = "getAttr";
var i = "name";
var j = "substring";
var k = "bucketSuffix";
var l = "parseURL";
var m = "{url#scheme}://{url#authority}/{uri_encoded_bucket}{url#path}";
var n = "endpoint";
var o = "tree";
var p = "aws.isVirtualHostableS3Bucket";
var q = "{url#scheme}://{Bucket}.{url#authority}{url#path}";
var r = "not";
var s = "{url#scheme}://{url#authority}{url#path}";
var t = "hardwareType";
var u = "regionPrefix";
var v = "bucketAliasSuffix";
var w = "outpostId";
var x = "isValidHostLabel";
var y = "sigv4a";
var z = "s3-outposts";
var A = "s3";
var B = "{url#scheme}://{url#authority}{url#normalizedPath}{Bucket}";
var C = "https://{Bucket}.s3-accelerate.{partitionResult#dnsSuffix}";
var D = "https://{Bucket}.s3.{partitionResult#dnsSuffix}";
var E = "aws.parseArn";
var F = "bucketArn";
var G = "arnType";
var H = "";
var I = "s3-object-lambda";
var J = "accesspoint";
var K = "accessPointName";
var L = "{url#scheme}://{accessPointName}-{bucketArn#accountId}.{url#authority}{url#path}";
var M = "mrapPartition";
var N = "outpostType";
var O = "arnPrefix";
var P = "{url#scheme}://{url#authority}{url#normalizedPath}{uri_encoded_bucket}";
var Q = "https://s3.{partitionResult#dnsSuffix}/{uri_encoded_bucket}";
var R = "https://s3.{partitionResult#dnsSuffix}";
var S = { [ce]: false, [cf]: "String" };
var T = { [ce]: true, "default": false, [cf]: "Boolean" };
var U = { [ce]: false, [cf]: "Boolean" };
var V = { [ch]: d, [ci]: [{ [cj]: "Accelerate" }, true] };
var W = { [ch]: d, [ci]: [{ [cj]: "UseFIPS" }, true] };
var X = { [ch]: d, [ci]: [{ [cj]: "UseDualStack" }, true] };
var Y = { [ch]: c, [ci]: [{ [cj]: "Endpoint" }] };
var Z = { [ch]: f, [ci]: [{ [cj]: "Region" }], [ck]: "partitionResult" };
var aa = { [ch]: g, [ci]: [{ [ch]: h, [ci]: [{ [cj]: "partitionResult" }, i] }, "aws-cn"] };
var ab = { [ch]: c, [ci]: [{ [cj]: "Bucket" }] };
var ac = { [cj]: "Bucket" };
var ad = { [ch]: l, [ci]: [{ [cj]: "Endpoint" }], [ck]: "url" };
var ae = { [ch]: d, [ci]: [{ [ch]: h, [ci]: [{ [cj]: "url" }, "isIp"] }, true] };
var af = { [cj]: "url" };
var ag = { [ch]: "uriEncode", [ci]: [ac], [ck]: "uri_encoded_bucket" };
var ah = { [cn]: "S3Express", [co]: [{ [cp]: true, [i]: "sigv4", [cq]: "s3express", [cr]: "{Region}" }] };
var ai = {};
var aj = { [ch]: p, [ci]: [ac, false] };
var ak = { [e]: "S3Express bucket name is not a valid virtual hostable name.", [cf]: e };
var al = { [cn]: "S3Express", [co]: [{ [cp]: true, [i]: "sigv4-s3express", [cq]: "s3express", [cr]: "{Region}" }] };
var am = { [ch]: c, [ci]: [{ [cj]: "UseS3ExpressControlEndpoint" }] };
var an = { [ch]: d, [ci]: [{ [cj]: "UseS3ExpressControlEndpoint" }, true] };
var ao = { [ch]: r, [ci]: [Y] };
var ap = { [e]: "Unrecognized S3Express bucket name format.", [cf]: e };
var aq = { [ch]: r, [ci]: [ab] };
var ar = { [cj]: t };
var as = { [cg]: [ao], [e]: "Expected a endpoint to be specified but no endpoint was found", [cf]: e };
var at = { [co]: [{ [cp]: true, [i]: y, [cq]: z, [ct]: ["*"] }, { [cp]: true, [i]: "sigv4", [cq]: z, [cr]: "{Region}" }] };
var au = { [ch]: d, [ci]: [{ [cj]: "ForcePathStyle" }, false] };
var av = { [cj]: "ForcePathStyle" };
var aw = { [ch]: d, [ci]: [{ [cj]: "Accelerate" }, false] };
var ax = { [ch]: g, [ci]: [{ [cj]: "Region" }, "aws-global"] };
var ay = { [co]: [{ [cp]: true, [i]: "sigv4", [cq]: A, [cr]: "us-east-1" }] };
var az = { [ch]: r, [ci]: [ax] };
var aA = { [ch]: d, [ci]: [{ [cj]: "UseGlobalEndpoint" }, true] };
var aB = { [cl]: "https://{Bucket}.s3-fips.dualstack.{Region}.{partitionResult#dnsSuffix}", [cm]: { [co]: [{ [cp]: true, [i]: "sigv4", [cq]: A, [cr]: "{Region}" }] }, [cs]: {} };
var aC = { [co]: [{ [cp]: true, [i]: "sigv4", [cq]: A, [cr]: "{Region}" }] };
var aD = { [ch]: d, [ci]: [{ [cj]: "UseGlobalEndpoint" }, false] };
var aE = { [ch]: d, [ci]: [{ [cj]: "UseDualStack" }, false] };
var aF = { [cl]: "https://{Bucket}.s3-fips.{Region}.{partitionResult#dnsSuffix}", [cm]: aC, [cs]: {} };
var aG = { [ch]: d, [ci]: [{ [cj]: "UseFIPS" }, false] };
var aH = { [cl]: "https://{Bucket}.s3-accelerate.dualstack.{partitionResult#dnsSuffix}", [cm]: aC, [cs]: {} };
var aI = { [cl]: "https://{Bucket}.s3.dualstack.{Region}.{partitionResult#dnsSuffix}", [cm]: aC, [cs]: {} };
var aJ = { [ch]: d, [ci]: [{ [ch]: h, [ci]: [af, "isIp"] }, false] };
var aK = { [cl]: B, [cm]: aC, [cs]: {} };
var aL = { [cl]: q, [cm]: aC, [cs]: {} };
var aM = { [n]: aL, [cf]: n };
var aN = { [cl]: C, [cm]: aC, [cs]: {} };
var aO = { [cl]: "https://{Bucket}.s3.{Region}.{partitionResult#dnsSuffix}", [cm]: aC, [cs]: {} };
var aP = { [e]: "Invalid region: region was not a valid DNS name.", [cf]: e };
var aQ = { [cj]: F };
var aR = { [cj]: G };
var aS = { [ch]: h, [ci]: [aQ, "service"] };
var aT = { [cj]: K };
var aU = { [cg]: [X], [e]: "S3 Object Lambda does not support Dual-stack", [cf]: e };
var aV = { [cg]: [V], [e]: "S3 Object Lambda does not support S3 Accelerate", [cf]: e };
var aW = { [cg]: [{ [ch]: c, [ci]: [{ [cj]: "DisableAccessPoints" }] }, { [ch]: d, [ci]: [{ [cj]: "DisableAccessPoints" }, true] }], [e]: "Access points are not supported for this operation", [cf]: e };
var aX = { [cg]: [{ [ch]: c, [ci]: [{ [cj]: "UseArnRegion" }] }, { [ch]: d, [ci]: [{ [cj]: "UseArnRegion" }, false] }, { [ch]: r, [ci]: [{ [ch]: g, [ci]: [{ [ch]: h, [ci]: [aQ, "region"] }, "{Region}"] }] }], [e]: "Invalid configuration: region from ARN `{bucketArn#region}` does not match client region `{Region}` and UseArnRegion is `false`", [cf]: e };
var aY = { [ch]: h, [ci]: [{ [cj]: "bucketPartition" }, i] };
var aZ = { [ch]: h, [ci]: [aQ, "accountId"] };
var ba = { [co]: [{ [cp]: true, [i]: "sigv4", [cq]: I, [cr]: "{bucketArn#region}" }] };
var bb = { [e]: "Invalid ARN: The access point name may only contain a-z, A-Z, 0-9 and `-`. Found: `{accessPointName}`", [cf]: e };
var bc = { [e]: "Invalid ARN: The account id may only contain a-z, A-Z, 0-9 and `-`. Found: `{bucketArn#accountId}`", [cf]: e };
var bd = { [e]: "Invalid region in ARN: `{bucketArn#region}` (invalid DNS name)", [cf]: e };
var be = { [e]: "Client was configured for partition `{partitionResult#name}` but ARN (`{Bucket}`) has `{bucketPartition#name}`", [cf]: e };
var bf = { [e]: "Invalid ARN: The ARN may only contain a single resource component after `accesspoint`.", [cf]: e };
var bg = { [e]: "Invalid ARN: Expected a resource of the format `accesspoint:<accesspoint name>` but no name was provided", [cf]: e };
var bh = { [co]: [{ [cp]: true, [i]: "sigv4", [cq]: A, [cr]: "{bucketArn#region}" }] };
var bi = { [co]: [{ [cp]: true, [i]: y, [cq]: z, [ct]: ["*"] }, { [cp]: true, [i]: "sigv4", [cq]: z, [cr]: "{bucketArn#region}" }] };
var bj = { [ch]: E, [ci]: [ac] };
var bk = { [cl]: "https://s3-fips.dualstack.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", [cm]: aC, [cs]: {} };
var bl = { [cl]: "https://s3-fips.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", [cm]: aC, [cs]: {} };
var bm = { [cl]: "https://s3.dualstack.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", [cm]: aC, [cs]: {} };
var bn = { [cl]: P, [cm]: aC, [cs]: {} };
var bo = { [cl]: "https://s3.{Region}.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", [cm]: aC, [cs]: {} };
var bp = { [cj]: "UseObjectLambdaEndpoint" };
var bq = { [co]: [{ [cp]: true, [i]: "sigv4", [cq]: I, [cr]: "{Region}" }] };
var br = { [cl]: "https://s3-fips.dualstack.{Region}.{partitionResult#dnsSuffix}", [cm]: aC, [cs]: {} };
var bs = { [cl]: "https://s3-fips.{Region}.{partitionResult#dnsSuffix}", [cm]: aC, [cs]: {} };
var bt = { [cl]: "https://s3.dualstack.{Region}.{partitionResult#dnsSuffix}", [cm]: aC, [cs]: {} };
var bu = { [cl]: s, [cm]: aC, [cs]: {} };
var bv = { [cl]: "https://s3.{Region}.{partitionResult#dnsSuffix}", [cm]: aC, [cs]: {} };
var bw = [{ [cj]: "Region" }];
var bx = [{ [cj]: "Endpoint" }];
var by = [ac];
var bz = [X];
var bA = [V];
var bB = [Y, ad];
var bC = [{ [ch]: c, [ci]: [{ [cj]: "DisableS3ExpressSessionAuth" }] }, { [ch]: d, [ci]: [{ [cj]: "DisableS3ExpressSessionAuth" }, true] }];
var bD = [ae];
var bE = [ag];
var bF = [aj];
var bG = [W];
var bH = [{ [ch]: j, [ci]: [ac, 6, 14, true], [ck]: "s3expressAvailabilityZoneId" }, { [ch]: j, [ci]: [ac, 14, 16, true], [ck]: "s3expressAvailabilityZoneDelim" }, { [ch]: g, [ci]: [{ [cj]: "s3expressAvailabilityZoneDelim" }, "--"] }];
var bI = [{ [cg]: [W], [n]: { [cl]: "https://{Bucket}.s3express-fips-{s3expressAvailabilityZoneId}.{Region}.amazonaws.com", [cm]: ah, [cs]: {} }, [cf]: n }, { [n]: { [cl]: "https://{Bucket}.s3express-{s3expressAvailabilityZoneId}.{Region}.amazonaws.com", [cm]: ah, [cs]: {} }, [cf]: n }];
var bJ = [{ [ch]: j, [ci]: [ac, 6, 15, true], [ck]: "s3expressAvailabilityZoneId" }, { [ch]: j, [ci]: [ac, 15, 17, true], [ck]: "s3expressAvailabilityZoneDelim" }, { [ch]: g, [ci]: [{ [cj]: "s3expressAvailabilityZoneDelim" }, "--"] }];
var bK = [{ [cg]: [W], [n]: { [cl]: "https://{Bucket}.s3express-fips-{s3expressAvailabilityZoneId}.{Region}.amazonaws.com", [cm]: al, [cs]: {} }, [cf]: n }, { [n]: { [cl]: "https://{Bucket}.s3express-{s3expressAvailabilityZoneId}.{Region}.amazonaws.com", [cm]: al, [cs]: {} }, [cf]: n }];
var bL = [ab];
var bM = [{ [ch]: x, [ci]: [{ [cj]: w }, false] }];
var bN = [{ [ch]: g, [ci]: [{ [cj]: u }, "beta"] }];
var bO = ["*"];
var bP = [Z];
var bQ = [{ [ch]: x, [ci]: [{ [cj]: "Region" }, false] }];
var bR = [{ [ch]: g, [ci]: [{ [cj]: "Region" }, "us-east-1"] }];
var bS = [{ [ch]: g, [ci]: [aR, J] }];
var bT = [{ [ch]: h, [ci]: [aQ, "resourceId[1]"], [ck]: K }, { [ch]: r, [ci]: [{ [ch]: g, [ci]: [aT, H] }] }];
var bU = [aQ, "resourceId[1]"];
var bV = [{ [ch]: r, [ci]: [{ [ch]: g, [ci]: [{ [ch]: h, [ci]: [aQ, "region"] }, H] }] }];
var bW = [{ [ch]: r, [ci]: [{ [ch]: c, [ci]: [{ [ch]: h, [ci]: [aQ, "resourceId[2]"] }] }] }];
var bX = [aQ, "resourceId[2]"];
var bY = [{ [ch]: f, [ci]: [{ [ch]: h, [ci]: [aQ, "region"] }], [ck]: "bucketPartition" }];
var bZ = [{ [ch]: g, [ci]: [aY, { [ch]: h, [ci]: [{ [cj]: "partitionResult" }, i] }] }];
var ca = [{ [ch]: x, [ci]: [{ [ch]: h, [ci]: [aQ, "region"] }, true] }];
var cb = [{ [ch]: x, [ci]: [aZ, false] }];
var cc = [{ [ch]: x, [ci]: [aT, false] }];
var cd = [{ [ch]: x, [ci]: [{ [cj]: "Region" }, true] }];
var _data = { version: "1.0", parameters: { Bucket: S, Region: S, UseFIPS: T, UseDualStack: T, Endpoint: S, ForcePathStyle: T, Accelerate: T, UseGlobalEndpoint: T, UseObjectLambdaEndpoint: U, Key: S, Prefix: S, DisableAccessPoints: U, DisableMultiRegionAccessPoints: T, UseArnRegion: U, UseS3ExpressControlEndpoint: U, DisableS3ExpressSessionAuth: U }, rules: [{ [cg]: [{ [ch]: c, [ci]: bw }], rules: [{ [cg]: [V, W], error: "Accelerate cannot be used with FIPS", [cf]: e }, { [cg]: [X, Y], error: "Cannot set dual-stack in combination with a custom endpoint.", [cf]: e }, { [cg]: [Y, W], error: "A custom endpoint cannot be combined with FIPS", [cf]: e }, { [cg]: [Y, V], error: "A custom endpoint cannot be combined with S3 Accelerate", [cf]: e }, { [cg]: [W, Z, aa], error: "Partition does not support FIPS", [cf]: e }, { [cg]: [ab, { [ch]: j, [ci]: [ac, 0, 6, b], [ck]: k }, { [ch]: g, [ci]: [{ [cj]: k }, "--x-s3"] }], rules: [{ [cg]: bz, error: "S3Express does not support Dual-stack.", [cf]: e }, { [cg]: bA, error: "S3Express does not support S3 Accelerate.", [cf]: e }, { [cg]: bB, rules: [{ [cg]: bC, rules: [{ [cg]: bD, rules: [{ [cg]: bE, rules: [{ endpoint: { [cl]: m, [cm]: ah, [cs]: ai }, [cf]: n }], [cf]: o }], [cf]: o }, { [cg]: bF, rules: [{ endpoint: { [cl]: q, [cm]: ah, [cs]: ai }, [cf]: n }], [cf]: o }, ak], [cf]: o }, { [cg]: bD, rules: [{ [cg]: bE, rules: [{ endpoint: { [cl]: m, [cm]: al, [cs]: ai }, [cf]: n }], [cf]: o }], [cf]: o }, { [cg]: bF, rules: [{ endpoint: { [cl]: q, [cm]: al, [cs]: ai }, [cf]: n }], [cf]: o }, ak], [cf]: o }, { [cg]: [am, an], rules: [{ [cg]: [ag, ao], rules: [{ [cg]: bG, endpoint: { [cl]: "https://s3express-control-fips.{Region}.amazonaws.com/{uri_encoded_bucket}", [cm]: ah, [cs]: ai }, [cf]: n }, { endpoint: { [cl]: "https://s3express-control.{Region}.amazonaws.com/{uri_encoded_bucket}", [cm]: ah, [cs]: ai }, [cf]: n }], [cf]: o }], [cf]: o }, { [cg]: bF, rules: [{ [cg]: bC, rules: [{ [cg]: bH, rules: bI, [cf]: o }, { [cg]: bJ, rules: bI, [cf]: o }, ap], [cf]: o }, { [cg]: bH, rules: bK, [cf]: o }, { [cg]: bJ, rules: bK, [cf]: o }, ap], [cf]: o }, ak], [cf]: o }, { [cg]: [aq, am, an], rules: [{ [cg]: bB, endpoint: { [cl]: s, [cm]: ah, [cs]: ai }, [cf]: n }, { [cg]: bG, endpoint: { [cl]: "https://s3express-control-fips.{Region}.amazonaws.com", [cm]: ah, [cs]: ai }, [cf]: n }, { endpoint: { [cl]: "https://s3express-control.{Region}.amazonaws.com", [cm]: ah, [cs]: ai }, [cf]: n }], [cf]: o }, { [cg]: [ab, { [ch]: j, [ci]: [ac, 49, 50, b], [ck]: t }, { [ch]: j, [ci]: [ac, 8, 12, b], [ck]: u }, { [ch]: j, [ci]: [ac, 0, 7, b], [ck]: v }, { [ch]: j, [ci]: [ac, 32, 49, b], [ck]: w }, { [ch]: f, [ci]: bw, [ck]: "regionPartition" }, { [ch]: g, [ci]: [{ [cj]: v }, "--op-s3"] }], rules: [{ [cg]: bM, rules: [{ [cg]: [{ [ch]: g, [ci]: [ar, "e"] }], rules: [{ [cg]: bN, rules: [as, { [cg]: bB, endpoint: { [cl]: "https://{Bucket}.ec2.{url#authority}", [cm]: at, [cs]: ai }, [cf]: n }], [cf]: o }, { endpoint: { [cl]: "https://{Bucket}.ec2.s3-outposts.{Region}.{regionPartition#dnsSuffix}", [cm]: at, [cs]: ai }, [cf]: n }], [cf]: o }, { [cg]: [{ [ch]: g, [ci]: [ar, "o"] }], rules: [{ [cg]: bN, rules: [as, { [cg]: bB, endpoint: { [cl]: "https://{Bucket}.op-{outpostId}.{url#authority}", [cm]: at, [cs]: ai }, [cf]: n }], [cf]: o }, { endpoint: { [cl]: "https://{Bucket}.op-{outpostId}.s3-outposts.{Region}.{regionPartition#dnsSuffix}", [cm]: at, [cs]: ai }, [cf]: n }], [cf]: o }, { error: 'Unrecognized hardware type: "Expected hardware type o or e but got {hardwareType}"', [cf]: e }], [cf]: o }, { error: "Invalid ARN: The outpost Id must only contain a-z, A-Z, 0-9 and `-`.", [cf]: e }], [cf]: o }, { [cg]: bL, rules: [{ [cg]: [Y, { [ch]: r, [ci]: [{ [ch]: c, [ci]: [{ [ch]: l, [ci]: bx }] }] }], error: "Custom endpoint `{Endpoint}` was not a valid URI", [cf]: e }, { [cg]: [au, aj], rules: [{ [cg]: bP, rules: [{ [cg]: bQ, rules: [{ [cg]: [V, aa], error: "S3 Accelerate cannot be used in this region", [cf]: e }, { [cg]: [X, W, aw, ao, ax], endpoint: { [cl]: "https://{Bucket}.s3-fips.dualstack.us-east-1.{partitionResult#dnsSuffix}", [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [X, W, aw, ao, az, aA], rules: [{ endpoint: aB, [cf]: n }], [cf]: o }, { [cg]: [X, W, aw, ao, az, aD], endpoint: aB, [cf]: n }, { [cg]: [aE, W, aw, ao, ax], endpoint: { [cl]: "https://{Bucket}.s3-fips.us-east-1.{partitionResult#dnsSuffix}", [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aE, W, aw, ao, az, aA], rules: [{ endpoint: aF, [cf]: n }], [cf]: o }, { [cg]: [aE, W, aw, ao, az, aD], endpoint: aF, [cf]: n }, { [cg]: [X, aG, V, ao, ax], endpoint: { [cl]: "https://{Bucket}.s3-accelerate.dualstack.us-east-1.{partitionResult#dnsSuffix}", [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [X, aG, V, ao, az, aA], rules: [{ endpoint: aH, [cf]: n }], [cf]: o }, { [cg]: [X, aG, V, ao, az, aD], endpoint: aH, [cf]: n }, { [cg]: [X, aG, aw, ao, ax], endpoint: { [cl]: "https://{Bucket}.s3.dualstack.us-east-1.{partitionResult#dnsSuffix}", [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [X, aG, aw, ao, az, aA], rules: [{ endpoint: aI, [cf]: n }], [cf]: o }, { [cg]: [X, aG, aw, ao, az, aD], endpoint: aI, [cf]: n }, { [cg]: [aE, aG, aw, Y, ad, ae, ax], endpoint: { [cl]: B, [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aE, aG, aw, Y, ad, aJ, ax], endpoint: { [cl]: q, [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aE, aG, aw, Y, ad, ae, az, aA], rules: [{ [cg]: bR, endpoint: aK, [cf]: n }, { endpoint: aK, [cf]: n }], [cf]: o }, { [cg]: [aE, aG, aw, Y, ad, aJ, az, aA], rules: [{ [cg]: bR, endpoint: aL, [cf]: n }, aM], [cf]: o }, { [cg]: [aE, aG, aw, Y, ad, ae, az, aD], endpoint: aK, [cf]: n }, { [cg]: [aE, aG, aw, Y, ad, aJ, az, aD], endpoint: aL, [cf]: n }, { [cg]: [aE, aG, V, ao, ax], endpoint: { [cl]: C, [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aE, aG, V, ao, az, aA], rules: [{ [cg]: bR, endpoint: aN, [cf]: n }, { endpoint: aN, [cf]: n }], [cf]: o }, { [cg]: [aE, aG, V, ao, az, aD], endpoint: aN, [cf]: n }, { [cg]: [aE, aG, aw, ao, ax], endpoint: { [cl]: D, [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aE, aG, aw, ao, az, aA], rules: [{ [cg]: bR, endpoint: { [cl]: D, [cm]: aC, [cs]: ai }, [cf]: n }, { endpoint: aO, [cf]: n }], [cf]: o }, { [cg]: [aE, aG, aw, ao, az, aD], endpoint: aO, [cf]: n }], [cf]: o }, aP], [cf]: o }], [cf]: o }, { [cg]: [Y, ad, { [ch]: g, [ci]: [{ [ch]: h, [ci]: [af, "scheme"] }, "http"] }, { [ch]: p, [ci]: [ac, b] }, au, aG, aE, aw], rules: [{ [cg]: bP, rules: [{ [cg]: bQ, rules: [aM], [cf]: o }, aP], [cf]: o }], [cf]: o }, { [cg]: [au, { [ch]: E, [ci]: by, [ck]: F }], rules: [{ [cg]: [{ [ch]: h, [ci]: [aQ, "resourceId[0]"], [ck]: G }, { [ch]: r, [ci]: [{ [ch]: g, [ci]: [aR, H] }] }], rules: [{ [cg]: [{ [ch]: g, [ci]: [aS, I] }], rules: [{ [cg]: bS, rules: [{ [cg]: bT, rules: [aU, aV, { [cg]: bV, rules: [aW, { [cg]: bW, rules: [aX, { [cg]: bY, rules: [{ [cg]: bP, rules: [{ [cg]: bZ, rules: [{ [cg]: ca, rules: [{ [cg]: [{ [ch]: g, [ci]: [aZ, H] }], error: "Invalid ARN: Missing account id", [cf]: e }, { [cg]: cb, rules: [{ [cg]: cc, rules: [{ [cg]: bB, endpoint: { [cl]: L, [cm]: ba, [cs]: ai }, [cf]: n }, { [cg]: bG, endpoint: { [cl]: "https://{accessPointName}-{bucketArn#accountId}.s3-object-lambda-fips.{bucketArn#region}.{bucketPartition#dnsSuffix}", [cm]: ba, [cs]: ai }, [cf]: n }, { endpoint: { [cl]: "https://{accessPointName}-{bucketArn#accountId}.s3-object-lambda.{bucketArn#region}.{bucketPartition#dnsSuffix}", [cm]: ba, [cs]: ai }, [cf]: n }], [cf]: o }, bb], [cf]: o }, bc], [cf]: o }, bd], [cf]: o }, be], [cf]: o }], [cf]: o }], [cf]: o }, bf], [cf]: o }, { error: "Invalid ARN: bucket ARN is missing a region", [cf]: e }], [cf]: o }, bg], [cf]: o }, { error: "Invalid ARN: Object Lambda ARNs only support `accesspoint` arn types, but found: `{arnType}`", [cf]: e }], [cf]: o }, { [cg]: bS, rules: [{ [cg]: bT, rules: [{ [cg]: bV, rules: [{ [cg]: bS, rules: [{ [cg]: bV, rules: [aW, { [cg]: bW, rules: [aX, { [cg]: bY, rules: [{ [cg]: bP, rules: [{ [cg]: [{ [ch]: g, [ci]: [aY, "{partitionResult#name}"] }], rules: [{ [cg]: ca, rules: [{ [cg]: [{ [ch]: g, [ci]: [aS, A] }], rules: [{ [cg]: cb, rules: [{ [cg]: cc, rules: [{ [cg]: bA, error: "Access Points do not support S3 Accelerate", [cf]: e }, { [cg]: [W, X], endpoint: { [cl]: "https://{accessPointName}-{bucketArn#accountId}.s3-accesspoint-fips.dualstack.{bucketArn#region}.{bucketPartition#dnsSuffix}", [cm]: bh, [cs]: ai }, [cf]: n }, { [cg]: [W, aE], endpoint: { [cl]: "https://{accessPointName}-{bucketArn#accountId}.s3-accesspoint-fips.{bucketArn#region}.{bucketPartition#dnsSuffix}", [cm]: bh, [cs]: ai }, [cf]: n }, { [cg]: [aG, X], endpoint: { [cl]: "https://{accessPointName}-{bucketArn#accountId}.s3-accesspoint.dualstack.{bucketArn#region}.{bucketPartition#dnsSuffix}", [cm]: bh, [cs]: ai }, [cf]: n }, { [cg]: [aG, aE, Y, ad], endpoint: { [cl]: L, [cm]: bh, [cs]: ai }, [cf]: n }, { [cg]: [aG, aE], endpoint: { [cl]: "https://{accessPointName}-{bucketArn#accountId}.s3-accesspoint.{bucketArn#region}.{bucketPartition#dnsSuffix}", [cm]: bh, [cs]: ai }, [cf]: n }], [cf]: o }, bb], [cf]: o }, bc], [cf]: o }, { error: "Invalid ARN: The ARN was not for the S3 service, found: {bucketArn#service}", [cf]: e }], [cf]: o }, bd], [cf]: o }, be], [cf]: o }], [cf]: o }], [cf]: o }, bf], [cf]: o }], [cf]: o }], [cf]: o }, { [cg]: [{ [ch]: x, [ci]: [aT, b] }], rules: [{ [cg]: bz, error: "S3 MRAP does not support dual-stack", [cf]: e }, { [cg]: bG, error: "S3 MRAP does not support FIPS", [cf]: e }, { [cg]: bA, error: "S3 MRAP does not support S3 Accelerate", [cf]: e }, { [cg]: [{ [ch]: d, [ci]: [{ [cj]: "DisableMultiRegionAccessPoints" }, b] }], error: "Invalid configuration: Multi-Region Access Point ARNs are disabled.", [cf]: e }, { [cg]: [{ [ch]: f, [ci]: bw, [ck]: M }], rules: [{ [cg]: [{ [ch]: g, [ci]: [{ [ch]: h, [ci]: [{ [cj]: M }, i] }, { [ch]: h, [ci]: [aQ, "partition"] }] }], rules: [{ endpoint: { [cl]: "https://{accessPointName}.accesspoint.s3-global.{mrapPartition#dnsSuffix}", [cm]: { [co]: [{ [cp]: b, name: y, [cq]: A, [ct]: bO }] }, [cs]: ai }, [cf]: n }], [cf]: o }, { error: "Client was configured for partition `{mrapPartition#name}` but bucket referred to partition `{bucketArn#partition}`", [cf]: e }], [cf]: o }], [cf]: o }, { error: "Invalid Access Point Name", [cf]: e }], [cf]: o }, bg], [cf]: o }, { [cg]: [{ [ch]: g, [ci]: [aS, z] }], rules: [{ [cg]: bz, error: "S3 Outposts does not support Dual-stack", [cf]: e }, { [cg]: bG, error: "S3 Outposts does not support FIPS", [cf]: e }, { [cg]: bA, error: "S3 Outposts does not support S3 Accelerate", [cf]: e }, { [cg]: [{ [ch]: c, [ci]: [{ [ch]: h, [ci]: [aQ, "resourceId[4]"] }] }], error: "Invalid Arn: Outpost Access Point ARN contains sub resources", [cf]: e }, { [cg]: [{ [ch]: h, [ci]: bU, [ck]: w }], rules: [{ [cg]: bM, rules: [aX, { [cg]: bY, rules: [{ [cg]: bP, rules: [{ [cg]: bZ, rules: [{ [cg]: ca, rules: [{ [cg]: cb, rules: [{ [cg]: [{ [ch]: h, [ci]: bX, [ck]: N }], rules: [{ [cg]: [{ [ch]: h, [ci]: [aQ, "resourceId[3]"], [ck]: K }], rules: [{ [cg]: [{ [ch]: g, [ci]: [{ [cj]: N }, J] }], rules: [{ [cg]: bB, endpoint: { [cl]: "https://{accessPointName}-{bucketArn#accountId}.{outpostId}.{url#authority}", [cm]: bi, [cs]: ai }, [cf]: n }, { endpoint: { [cl]: "https://{accessPointName}-{bucketArn#accountId}.{outpostId}.s3-outposts.{bucketArn#region}.{bucketPartition#dnsSuffix}", [cm]: bi, [cs]: ai }, [cf]: n }], [cf]: o }, { error: "Expected an outpost type `accesspoint`, found {outpostType}", [cf]: e }], [cf]: o }, { error: "Invalid ARN: expected an access point name", [cf]: e }], [cf]: o }, { error: "Invalid ARN: Expected a 4-component resource", [cf]: e }], [cf]: o }, bc], [cf]: o }, bd], [cf]: o }, be], [cf]: o }], [cf]: o }], [cf]: o }, { error: "Invalid ARN: The outpost Id may only contain a-z, A-Z, 0-9 and `-`. Found: `{outpostId}`", [cf]: e }], [cf]: o }, { error: "Invalid ARN: The Outpost Id was not set", [cf]: e }], [cf]: o }, { error: "Invalid ARN: Unrecognized format: {Bucket} (type: {arnType})", [cf]: e }], [cf]: o }, { error: "Invalid ARN: No ARN type specified", [cf]: e }], [cf]: o }, { [cg]: [{ [ch]: j, [ci]: [ac, 0, 4, a], [ck]: O }, { [ch]: g, [ci]: [{ [cj]: O }, "arn:"] }, { [ch]: r, [ci]: [{ [ch]: c, [ci]: [bj] }] }], error: "Invalid ARN: `{Bucket}` was not a valid ARN", [cf]: e }, { [cg]: [{ [ch]: d, [ci]: [av, b] }, bj], error: "Path-style addressing cannot be used with ARN buckets", [cf]: e }, { [cg]: bE, rules: [{ [cg]: bP, rules: [{ [cg]: [aw], rules: [{ [cg]: [X, ao, W, ax], endpoint: { [cl]: "https://s3-fips.dualstack.us-east-1.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [X, ao, W, az, aA], rules: [{ endpoint: bk, [cf]: n }], [cf]: o }, { [cg]: [X, ao, W, az, aD], endpoint: bk, [cf]: n }, { [cg]: [aE, ao, W, ax], endpoint: { [cl]: "https://s3-fips.us-east-1.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aE, ao, W, az, aA], rules: [{ endpoint: bl, [cf]: n }], [cf]: o }, { [cg]: [aE, ao, W, az, aD], endpoint: bl, [cf]: n }, { [cg]: [X, ao, aG, ax], endpoint: { [cl]: "https://s3.dualstack.us-east-1.{partitionResult#dnsSuffix}/{uri_encoded_bucket}", [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [X, ao, aG, az, aA], rules: [{ endpoint: bm, [cf]: n }], [cf]: o }, { [cg]: [X, ao, aG, az, aD], endpoint: bm, [cf]: n }, { [cg]: [aE, Y, ad, aG, ax], endpoint: { [cl]: P, [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aE, Y, ad, aG, az, aA], rules: [{ [cg]: bR, endpoint: bn, [cf]: n }, { endpoint: bn, [cf]: n }], [cf]: o }, { [cg]: [aE, Y, ad, aG, az, aD], endpoint: bn, [cf]: n }, { [cg]: [aE, ao, aG, ax], endpoint: { [cl]: Q, [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aE, ao, aG, az, aA], rules: [{ [cg]: bR, endpoint: { [cl]: Q, [cm]: aC, [cs]: ai }, [cf]: n }, { endpoint: bo, [cf]: n }], [cf]: o }, { [cg]: [aE, ao, aG, az, aD], endpoint: bo, [cf]: n }], [cf]: o }, { error: "Path-style addressing cannot be used with S3 Accelerate", [cf]: e }], [cf]: o }], [cf]: o }], [cf]: o }, { [cg]: [{ [ch]: c, [ci]: [bp] }, { [ch]: d, [ci]: [bp, b] }], rules: [{ [cg]: bP, rules: [{ [cg]: cd, rules: [aU, aV, { [cg]: bB, endpoint: { [cl]: s, [cm]: bq, [cs]: ai }, [cf]: n }, { [cg]: bG, endpoint: { [cl]: "https://s3-object-lambda-fips.{Region}.{partitionResult#dnsSuffix}", [cm]: bq, [cs]: ai }, [cf]: n }, { endpoint: { [cl]: "https://s3-object-lambda.{Region}.{partitionResult#dnsSuffix}", [cm]: bq, [cs]: ai }, [cf]: n }], [cf]: o }, aP], [cf]: o }], [cf]: o }, { [cg]: [aq], rules: [{ [cg]: bP, rules: [{ [cg]: cd, rules: [{ [cg]: [W, X, ao, ax], endpoint: { [cl]: "https://s3-fips.dualstack.us-east-1.{partitionResult#dnsSuffix}", [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [W, X, ao, az, aA], rules: [{ endpoint: br, [cf]: n }], [cf]: o }, { [cg]: [W, X, ao, az, aD], endpoint: br, [cf]: n }, { [cg]: [W, aE, ao, ax], endpoint: { [cl]: "https://s3-fips.us-east-1.{partitionResult#dnsSuffix}", [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [W, aE, ao, az, aA], rules: [{ endpoint: bs, [cf]: n }], [cf]: o }, { [cg]: [W, aE, ao, az, aD], endpoint: bs, [cf]: n }, { [cg]: [aG, X, ao, ax], endpoint: { [cl]: "https://s3.dualstack.us-east-1.{partitionResult#dnsSuffix}", [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aG, X, ao, az, aA], rules: [{ endpoint: bt, [cf]: n }], [cf]: o }, { [cg]: [aG, X, ao, az, aD], endpoint: bt, [cf]: n }, { [cg]: [aG, aE, Y, ad, ax], endpoint: { [cl]: s, [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aG, aE, Y, ad, az, aA], rules: [{ [cg]: bR, endpoint: bu, [cf]: n }, { endpoint: bu, [cf]: n }], [cf]: o }, { [cg]: [aG, aE, Y, ad, az, aD], endpoint: bu, [cf]: n }, { [cg]: [aG, aE, ao, ax], endpoint: { [cl]: R, [cm]: ay, [cs]: ai }, [cf]: n }, { [cg]: [aG, aE, ao, az, aA], rules: [{ [cg]: bR, endpoint: { [cl]: R, [cm]: aC, [cs]: ai }, [cf]: n }, { endpoint: bv, [cf]: n }], [cf]: o }, { [cg]: [aG, aE, ao, az, aD], endpoint: bv, [cf]: n }], [cf]: o }, aP], [cf]: o }], [cf]: o }], [cf]: o }, { error: "A region must be set when sending requests to S3.", [cf]: e }] };
var ruleSet = _data;

// node_modules/@aws-sdk/client-s3/dist-es/endpoint/endpointResolver.js
var defaultEndpointResolver = (endpointParams, context = {}) => {
  return resolveEndpoint(ruleSet, {
    endpointParams,
    logger: context.logger
  });
};
customEndpointFunctions.aws = awsEndpointFunctions;

// node_modules/@aws-sdk/client-s3/dist-es/runtimeConfig.shared.js
var getRuntimeConfig = (config) => {
  return {
    apiVersion: "2006-03-01",
    base64Decoder: config?.base64Decoder ?? fromBase64,
    base64Encoder: config?.base64Encoder ?? toBase64,
    disableHostPrefix: config?.disableHostPrefix ?? false,
    endpointProvider: config?.endpointProvider ?? defaultEndpointResolver,
    extensions: config?.extensions ?? [],
    getAwsChunkedEncodingStream: config?.getAwsChunkedEncodingStream ?? getAwsChunkedEncodingStream,
    logger: config?.logger ?? new NoOpLogger(),
    sdkStreamMixin: config?.sdkStreamMixin ?? sdkStreamMixin,
    serviceId: config?.serviceId ?? "S3",
    signerConstructor: config?.signerConstructor ?? SignatureV4MultiRegion,
    signingEscapePath: config?.signingEscapePath ?? false,
    urlParser: config?.urlParser ?? parseUrl,
    useArnRegion: config?.useArnRegion ?? false,
    utf8Decoder: config?.utf8Decoder ?? fromUtf8,
    utf8Encoder: config?.utf8Encoder ?? toUtf8
  };
};

// node_modules/@smithy/util-defaults-mode-browser/dist-es/resolveDefaultsModeConfig.js
var import_bowser2 = __toESM(require_es5());

// node_modules/@smithy/util-defaults-mode-browser/dist-es/constants.js
var DEFAULTS_MODE_OPTIONS = ["in-region", "cross-region", "mobile", "standard", "legacy"];

// node_modules/@smithy/util-defaults-mode-browser/dist-es/resolveDefaultsModeConfig.js
var resolveDefaultsModeConfig = ({ defaultsMode } = {}) => memoize(async () => {
  const mode = typeof defaultsMode === "function" ? await defaultsMode() : defaultsMode;
  switch (mode?.toLowerCase()) {
    case "auto":
      return Promise.resolve(isMobileBrowser() ? "mobile" : "standard");
    case "mobile":
    case "in-region":
    case "cross-region":
    case "standard":
    case "legacy":
      return Promise.resolve(mode?.toLocaleLowerCase());
    case void 0:
      return Promise.resolve("legacy");
    default:
      throw new Error(`Invalid parameter for "defaultsMode", expect ${DEFAULTS_MODE_OPTIONS.join(", ")}, got ${mode}`);
  }
});
var isMobileBrowser = () => {
  const parsedUA = typeof window !== "undefined" && window?.navigator?.userAgent ? import_bowser2.default.parse(window.navigator.userAgent) : void 0;
  const platform = parsedUA?.platform?.type;
  return platform === "tablet" || platform === "mobile";
};

// node_modules/@aws-sdk/client-s3/dist-es/runtimeConfig.browser.js
var getRuntimeConfig2 = (config) => {
  const defaultsMode = resolveDefaultsModeConfig(config);
  const defaultConfigProvider = () => defaultsMode().then(loadConfigsForDefaultMode);
  const clientSharedValues = getRuntimeConfig(config);
  return {
    ...clientSharedValues,
    ...config,
    runtime: "browser",
    defaultsMode,
    bodyLengthChecker: config?.bodyLengthChecker ?? calculateBodyLength,
    credentialDefaultProvider: config?.credentialDefaultProvider ?? ((_) => () => Promise.reject(new Error("Credential is missing"))),
    defaultUserAgentProvider: config?.defaultUserAgentProvider ?? defaultUserAgent({ serviceId: clientSharedValues.serviceId, clientVersion: package_default.version }),
    eventStreamSerdeProvider: config?.eventStreamSerdeProvider ?? eventStreamSerdeProvider,
    maxAttempts: config?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    md5: config?.md5 ?? Md5,
    region: config?.region ?? invalidProvider("Region is missing"),
    requestHandler: FetchHttpHandler.create(config?.requestHandler ?? defaultConfigProvider),
    retryMode: config?.retryMode ?? (async () => (await defaultConfigProvider()).retryMode || DEFAULT_RETRY_MODE),
    sha1: config?.sha1 ?? import_sha1_browser.Sha1,
    sha256: config?.sha256 ?? import_sha256_browser.Sha256,
    streamCollector: config?.streamCollector ?? streamCollector,
    streamHasher: config?.streamHasher ?? blobHasher,
    useDualstackEndpoint: config?.useDualstackEndpoint ?? (() => Promise.resolve(DEFAULT_USE_DUALSTACK_ENDPOINT)),
    useFipsEndpoint: config?.useFipsEndpoint ?? (() => Promise.resolve(DEFAULT_USE_FIPS_ENDPOINT))
  };
};

// node_modules/@aws-sdk/region-config-resolver/dist-es/extensions/index.js
var getAwsRegionExtensionConfiguration = (runtimeConfig) => {
  let runtimeConfigRegion = async () => {
    if (runtimeConfig.region === void 0) {
      throw new Error("Region is missing from runtimeConfig");
    }
    const region = runtimeConfig.region;
    if (typeof region === "string") {
      return region;
    }
    return region();
  };
  return {
    setRegion(region) {
      runtimeConfigRegion = region;
    },
    region() {
      return runtimeConfigRegion;
    }
  };
};
var resolveAwsRegionExtensionConfiguration = (awsRegionExtensionConfiguration) => {
  return {
    region: awsRegionExtensionConfiguration.region()
  };
};

// node_modules/@aws-sdk/client-s3/dist-es/runtimeExtensions.js
var asPartial = (t2) => t2;
var resolveRuntimeExtensions = (runtimeConfig, extensions) => {
  const extensionConfiguration = {
    ...asPartial(getAwsRegionExtensionConfiguration(runtimeConfig)),
    ...asPartial(getDefaultExtensionConfiguration(runtimeConfig)),
    ...asPartial(getHttpHandlerExtensionConfiguration(runtimeConfig))
  };
  extensions.forEach((extension) => extension.configure(extensionConfiguration));
  return {
    ...runtimeConfig,
    ...resolveAwsRegionExtensionConfiguration(extensionConfiguration),
    ...resolveDefaultRuntimeConfig(extensionConfiguration),
    ...resolveHttpHandlerRuntimeConfig(extensionConfiguration)
  };
};

// node_modules/@aws-sdk/client-s3/dist-es/S3Client.js
var S3Client = class extends Client {
  constructor(...[configuration]) {
    const _config_0 = getRuntimeConfig2(configuration || {});
    const _config_1 = resolveClientEndpointParameters(_config_0);
    const _config_2 = resolveRegionConfig(_config_1);
    const _config_3 = resolveEndpointConfig(_config_2);
    const _config_4 = resolveRetryConfig(_config_3);
    const _config_5 = resolveHostHeaderConfig(_config_4);
    const _config_6 = resolveAwsAuthConfig(_config_5);
    const _config_7 = resolveS3Config(_config_6, { session: [() => this, CreateSessionCommand] });
    const _config_8 = resolveUserAgentConfig(_config_7);
    const _config_9 = resolveEventStreamSerdeConfig(_config_8);
    const _config_10 = resolveRuntimeExtensions(_config_9, configuration?.extensions || []);
    super(_config_10);
    this.config = _config_10;
    this.middlewareStack.use(getRetryPlugin(this.config));
    this.middlewareStack.use(getContentLengthPlugin(this.config));
    this.middlewareStack.use(getHostHeaderPlugin(this.config));
    this.middlewareStack.use(getLoggerPlugin(this.config));
    this.middlewareStack.use(getRecursionDetectionPlugin(this.config));
    this.middlewareStack.use(getAwsAuthPlugin(this.config));
    this.middlewareStack.use(getValidateBucketNamePlugin(this.config));
    this.middlewareStack.use(getAddExpectContinuePlugin(this.config));
    this.middlewareStack.use(getRegionRedirectMiddlewarePlugin(this.config));
    this.middlewareStack.use(getS3ExpressPlugin(this.config));
    this.middlewareStack.use(getUserAgentPlugin(this.config));
  }
  destroy() {
    super.destroy();
  }
};

// node_modules/@aws-sdk/middleware-ssec/dist-es/index.js
function ssecMiddleware(options) {
  return (next) => async (args) => {
    const input = { ...args.input };
    const properties = [
      {
        target: "SSECustomerKey",
        hash: "SSECustomerKeyMD5"
      },
      {
        target: "CopySourceSSECustomerKey",
        hash: "CopySourceSSECustomerKeyMD5"
      }
    ];
    for (const prop of properties) {
      const value = input[prop.target];
      if (value) {
        let valueForHash;
        if (typeof value === "string") {
          if (isValidBase64EncodedSSECustomerKey(value, options)) {
            valueForHash = options.base64Decoder(value);
          } else {
            valueForHash = options.utf8Decoder(value);
            input[prop.target] = options.base64Encoder(valueForHash);
          }
        } else {
          valueForHash = ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(value);
          input[prop.target] = options.base64Encoder(valueForHash);
        }
        const hash = new options.md5();
        hash.update(valueForHash);
        input[prop.hash] = options.base64Encoder(await hash.digest());
      }
    }
    return next({
      ...args,
      input
    });
  };
}
var ssecMiddlewareOptions = {
  name: "ssecMiddleware",
  step: "initialize",
  tags: ["SSE"],
  override: true
};
var getSsecPlugin = (config) => ({
  applyToStack: (clientStack) => {
    clientStack.add(ssecMiddleware(config), ssecMiddlewareOptions);
  }
});
function isValidBase64EncodedSSECustomerKey(str, options) {
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  if (!base64Regex.test(str))
    return false;
  try {
    const decodedBytes = options.base64Decoder(str);
    return decodedBytes.length === 32;
  } catch {
    return false;
  }
}

// node_modules/@aws-sdk/middleware-location-constraint/dist-es/index.js
function locationConstraintMiddleware(options) {
  return (next) => async (args) => {
    const { CreateBucketConfiguration } = args.input;
    const region = await options.region();
    if (!CreateBucketConfiguration?.LocationConstraint && !CreateBucketConfiguration?.Location) {
      args = {
        ...args,
        input: {
          ...args.input,
          CreateBucketConfiguration: region === "us-east-1" ? void 0 : { LocationConstraint: region }
        }
      };
    }
    return next(args);
  };
}
var locationConstraintMiddlewareOptions = {
  step: "initialize",
  tags: ["LOCATION_CONSTRAINT", "CREATE_BUCKET_CONFIGURATION"],
  name: "locationConstraintMiddleware",
  override: true
};
var getLocationConstraintPlugin = (config) => ({
  applyToStack: (clientStack) => {
    clientStack.add(locationConstraintMiddleware(config), locationConstraintMiddlewareOptions);
  }
});

// node_modules/@aws-sdk/client-s3/dist-es/commands/CreateBucketCommand.js
var CreateBucketCommand = class extends Command.classBuilder().ep({
  ...commonParams,
  UseS3ExpressControlEndpoint: { type: "staticContextParams", value: true },
  DisableAccessPoints: { type: "staticContextParams", value: true },
  Bucket: { type: "contextParams", name: "Bucket" }
}).m(function(Command2, cs2, config, o2) {
  return [
    getSerdePlugin(config, this.serialize, this.deserialize),
    getEndpointPlugin(config, Command2.getEndpointParameterInstructions()),
    getLocationConstraintPlugin(config)
  ];
}).s("AmazonS3", "CreateBucket", {}).n("S3Client", "CreateBucketCommand").f(void 0, void 0).ser(se_CreateBucketCommand).de(de_CreateBucketCommand).build() {
};

// node_modules/@aws-sdk/client-s3/dist-es/commands/DeleteObjectCommand.js
var DeleteObjectCommand = class extends Command.classBuilder().ep({
  ...commonParams,
  Bucket: { type: "contextParams", name: "Bucket" },
  Key: { type: "contextParams", name: "Key" }
}).m(function(Command2, cs2, config, o2) {
  return [
    getSerdePlugin(config, this.serialize, this.deserialize),
    getEndpointPlugin(config, Command2.getEndpointParameterInstructions())
  ];
}).s("AmazonS3", "DeleteObject", {}).n("S3Client", "DeleteObjectCommand").f(void 0, void 0).ser(se_DeleteObjectCommand).de(de_DeleteObjectCommand).build() {
};

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/constants.js
var ChecksumAlgorithm;
(function(ChecksumAlgorithm2) {
  ChecksumAlgorithm2["MD5"] = "MD5";
  ChecksumAlgorithm2["CRC32"] = "CRC32";
  ChecksumAlgorithm2["CRC32C"] = "CRC32C";
  ChecksumAlgorithm2["SHA1"] = "SHA1";
  ChecksumAlgorithm2["SHA256"] = "SHA256";
})(ChecksumAlgorithm || (ChecksumAlgorithm = {}));
var ChecksumLocation;
(function(ChecksumLocation2) {
  ChecksumLocation2["HEADER"] = "header";
  ChecksumLocation2["TRAILER"] = "trailer";
})(ChecksumLocation || (ChecksumLocation = {}));
var DEFAULT_CHECKSUM_ALGORITHM = ChecksumAlgorithm.MD5;
var S3_EXPRESS_DEFAULT_CHECKSUM_ALGORITHM = ChecksumAlgorithm.CRC32;

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/types.js
var CLIENT_SUPPORTED_ALGORITHMS = [
  ChecksumAlgorithm.CRC32,
  ChecksumAlgorithm.CRC32C,
  ChecksumAlgorithm.SHA1,
  ChecksumAlgorithm.SHA256
];
var PRIORITY_ORDER_ALGORITHMS = [
  ChecksumAlgorithm.CRC32,
  ChecksumAlgorithm.CRC32C,
  ChecksumAlgorithm.SHA1,
  ChecksumAlgorithm.SHA256
];

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/getChecksumAlgorithmForRequest.js
var getChecksumAlgorithmForRequest = (input, { requestChecksumRequired, requestAlgorithmMember }, isS3Express) => {
  const defaultAlgorithm = isS3Express ? S3_EXPRESS_DEFAULT_CHECKSUM_ALGORITHM : DEFAULT_CHECKSUM_ALGORITHM;
  if (!requestAlgorithmMember || !input[requestAlgorithmMember]) {
    return requestChecksumRequired ? defaultAlgorithm : void 0;
  }
  const checksumAlgorithm = input[requestAlgorithmMember];
  if (!CLIENT_SUPPORTED_ALGORITHMS.includes(checksumAlgorithm)) {
    throw new Error(`The checksum algorithm "${checksumAlgorithm}" is not supported by the client. Select one of ${CLIENT_SUPPORTED_ALGORITHMS}.`);
  }
  return checksumAlgorithm;
};

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/getChecksumLocationName.js
var getChecksumLocationName = (algorithm) => algorithm === ChecksumAlgorithm.MD5 ? "content-md5" : `x-amz-checksum-${algorithm.toLowerCase()}`;

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/hasHeader.js
var hasHeader2 = (header, headers) => {
  const soughtHeader = header.toLowerCase();
  for (const headerName of Object.keys(headers)) {
    if (soughtHeader === headerName.toLowerCase()) {
      return true;
    }
  }
  return false;
};

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/isStreaming.js
var isStreaming = (body) => body !== void 0 && typeof body !== "string" && !ArrayBuffer.isView(body) && !isArrayBuffer(body);

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/selectChecksumAlgorithmFunction.js
var import_crc323 = __toESM(require_build7());
var import_crc32c = __toESM(require_build8());
var selectChecksumAlgorithmFunction = (checksumAlgorithm, config) => ({
  [ChecksumAlgorithm.MD5]: config.md5,
  [ChecksumAlgorithm.CRC32]: import_crc323.AwsCrc32,
  [ChecksumAlgorithm.CRC32C]: import_crc32c.AwsCrc32c,
  [ChecksumAlgorithm.SHA1]: config.sha1,
  [ChecksumAlgorithm.SHA256]: config.sha256
})[checksumAlgorithm];

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/stringHasher.js
var stringHasher = (checksumAlgorithmFn, body) => {
  const hash = new checksumAlgorithmFn();
  hash.update(toUint8Array(body || ""));
  return hash.digest();
};

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/flexibleChecksumsMiddleware.js
var flexibleChecksumsMiddlewareOptions = {
  name: "flexibleChecksumsMiddleware",
  step: "build",
  tags: ["BODY_CHECKSUM"],
  override: true
};
var flexibleChecksumsMiddleware = (config, middlewareConfig) => (next, context) => async (args) => {
  if (!HttpRequest.isInstance(args.request)) {
    return next(args);
  }
  const { request } = args;
  const { body: requestBody, headers } = request;
  const { base64Encoder, streamHasher } = config;
  const { input, requestChecksumRequired, requestAlgorithmMember } = middlewareConfig;
  const checksumAlgorithm = getChecksumAlgorithmForRequest(input, {
    requestChecksumRequired,
    requestAlgorithmMember
  }, !!context.isS3ExpressBucket);
  let updatedBody = requestBody;
  let updatedHeaders = headers;
  if (checksumAlgorithm) {
    const checksumLocationName = getChecksumLocationName(checksumAlgorithm);
    const checksumAlgorithmFn = selectChecksumAlgorithmFunction(checksumAlgorithm, config);
    if (isStreaming(requestBody)) {
      const { getAwsChunkedEncodingStream: getAwsChunkedEncodingStream2, bodyLengthChecker } = config;
      updatedBody = getAwsChunkedEncodingStream2(requestBody, {
        base64Encoder,
        bodyLengthChecker,
        checksumLocationName,
        checksumAlgorithmFn,
        streamHasher
      });
      updatedHeaders = {
        ...headers,
        "content-encoding": headers["content-encoding"] ? `${headers["content-encoding"]},aws-chunked` : "aws-chunked",
        "transfer-encoding": "chunked",
        "x-amz-decoded-content-length": headers["content-length"],
        "x-amz-content-sha256": "STREAMING-UNSIGNED-PAYLOAD-TRAILER",
        "x-amz-trailer": checksumLocationName
      };
      delete updatedHeaders["content-length"];
    } else if (!hasHeader2(checksumLocationName, headers)) {
      const rawChecksum = await stringHasher(checksumAlgorithmFn, requestBody);
      updatedHeaders = {
        ...headers,
        [checksumLocationName]: base64Encoder(rawChecksum)
      };
    }
  }
  const result = await next({
    ...args,
    request: {
      ...request,
      headers: updatedHeaders,
      body: updatedBody
    }
  });
  return result;
};

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/getChecksumAlgorithmListForResponse.js
var getChecksumAlgorithmListForResponse = (responseAlgorithms = []) => {
  const validChecksumAlgorithms = [];
  for (const algorithm of PRIORITY_ORDER_ALGORITHMS) {
    if (!responseAlgorithms.includes(algorithm) || !CLIENT_SUPPORTED_ALGORITHMS.includes(algorithm)) {
      continue;
    }
    validChecksumAlgorithms.push(algorithm);
  }
  return validChecksumAlgorithms;
};

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/isChecksumWithPartNumber.js
var isChecksumWithPartNumber = (checksum) => {
  const lastHyphenIndex = checksum.lastIndexOf("-");
  if (lastHyphenIndex !== -1) {
    const numberPart = checksum.slice(lastHyphenIndex + 1);
    if (!numberPart.startsWith("0")) {
      const number = parseInt(numberPart, 10);
      if (!isNaN(number) && number >= 1 && number <= 1e4) {
        return true;
      }
    }
  }
  return false;
};

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/streams/create-read-stream-on-buffer.browser.js
function createReadStreamOnBuffer(buffer) {
  return new Blob([buffer]).stream();
}

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/getChecksum.js
var getChecksum = async (body, { streamHasher, checksumAlgorithmFn, base64Encoder }) => {
  const digest = isStreaming(body) ? streamHasher(checksumAlgorithmFn, body) : stringHasher(checksumAlgorithmFn, body);
  return base64Encoder(await digest);
};

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/validateChecksumFromResponse.js
var validateChecksumFromResponse = async (response, { config, responseAlgorithms }) => {
  const checksumAlgorithms = getChecksumAlgorithmListForResponse(responseAlgorithms);
  const { body: responseBody, headers: responseHeaders } = response;
  for (const algorithm of checksumAlgorithms) {
    const responseHeader = getChecksumLocationName(algorithm);
    const checksumFromResponse = responseHeaders[responseHeader];
    if (checksumFromResponse) {
      const checksumAlgorithmFn = selectChecksumAlgorithmFunction(algorithm, config);
      const { streamHasher, base64Encoder } = config;
      const checksum = await getChecksum(responseBody, { streamHasher, checksumAlgorithmFn, base64Encoder });
      if (checksum === checksumFromResponse) {
        break;
      }
      throw new Error(`Checksum mismatch: expected "${checksum}" but received "${checksumFromResponse}" in response header "${responseHeader}".`);
    }
  }
};

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/flexibleChecksumsResponseMiddleware.js
var flexibleChecksumsResponseMiddlewareOptions = {
  name: "flexibleChecksumsResponseMiddleware",
  toMiddleware: "deserializerMiddleware",
  relation: "after",
  tags: ["BODY_CHECKSUM"],
  override: true
};
var flexibleChecksumsResponseMiddleware = (config, middlewareConfig) => (next, context) => async (args) => {
  if (!HttpRequest.isInstance(args.request)) {
    return next(args);
  }
  const input = args.input;
  const result = await next(args);
  const response = result.response;
  let collectedStream = void 0;
  const { requestValidationModeMember, responseAlgorithms } = middlewareConfig;
  if (requestValidationModeMember && input[requestValidationModeMember] === "ENABLED") {
    const { clientName, commandName } = context;
    const isS3WholeObjectMultipartGetResponseChecksum = clientName === "S3Client" && commandName === "GetObjectCommand" && getChecksumAlgorithmListForResponse(responseAlgorithms).every((algorithm) => {
      const responseHeader = getChecksumLocationName(algorithm);
      const checksumFromResponse = response.headers[responseHeader];
      return !checksumFromResponse || isChecksumWithPartNumber(checksumFromResponse);
    });
    if (isS3WholeObjectMultipartGetResponseChecksum) {
      return result;
    }
    const isStreamingBody = isStreaming(response.body);
    if (isStreamingBody) {
      collectedStream = await config.streamCollector(response.body);
      response.body = createReadStreamOnBuffer(collectedStream);
    }
    await validateChecksumFromResponse(result.response, {
      config,
      responseAlgorithms
    });
    if (isStreamingBody && collectedStream) {
      response.body = createReadStreamOnBuffer(collectedStream);
    }
  }
  return result;
};

// node_modules/@aws-sdk/middleware-flexible-checksums/dist-es/getFlexibleChecksumsPlugin.js
var getFlexibleChecksumsPlugin = (config, middlewareConfig) => ({
  applyToStack: (clientStack) => {
    clientStack.add(flexibleChecksumsMiddleware(config, middlewareConfig), flexibleChecksumsMiddlewareOptions);
    clientStack.addRelativeTo(flexibleChecksumsResponseMiddleware(config, middlewareConfig), flexibleChecksumsResponseMiddlewareOptions);
  }
});

// node_modules/@aws-sdk/client-s3/dist-es/commands/GetObjectCommand.js
var GetObjectCommand = class extends Command.classBuilder().ep({
  ...commonParams,
  Bucket: { type: "contextParams", name: "Bucket" },
  Key: { type: "contextParams", name: "Key" }
}).m(function(Command2, cs2, config, o2) {
  return [
    getSerdePlugin(config, this.serialize, this.deserialize),
    getEndpointPlugin(config, Command2.getEndpointParameterInstructions()),
    getSsecPlugin(config),
    getS3ExpiresMiddlewarePlugin(config),
    getFlexibleChecksumsPlugin(config, {
      input: this.input,
      requestChecksumRequired: false,
      requestValidationModeMember: "ChecksumMode",
      responseAlgorithms: ["CRC32", "CRC32C", "SHA256", "SHA1"]
    })
  ];
}).s("AmazonS3", "GetObject", {}).n("S3Client", "GetObjectCommand").f(GetObjectRequestFilterSensitiveLog, GetObjectOutputFilterSensitiveLog).ser(se_GetObjectCommand).de(de_GetObjectCommand).build() {
};

// node_modules/@aws-sdk/client-s3/dist-es/commands/ListBucketsCommand.js
var ListBucketsCommand = class extends Command.classBuilder().ep({
  ...commonParams
}).m(function(Command2, cs2, config, o2) {
  return [
    getSerdePlugin(config, this.serialize, this.deserialize),
    getEndpointPlugin(config, Command2.getEndpointParameterInstructions())
  ];
}).s("AmazonS3", "ListBuckets", {}).n("S3Client", "ListBucketsCommand").f(void 0, void 0).ser(se_ListBucketsCommand).de(de_ListBucketsCommand).build() {
};

// node_modules/@aws-sdk/client-s3/dist-es/commands/ListObjectsV2Command.js
var ListObjectsV2Command = class extends Command.classBuilder().ep({
  ...commonParams,
  Bucket: { type: "contextParams", name: "Bucket" },
  Prefix: { type: "contextParams", name: "Prefix" }
}).m(function(Command2, cs2, config, o2) {
  return [
    getSerdePlugin(config, this.serialize, this.deserialize),
    getEndpointPlugin(config, Command2.getEndpointParameterInstructions())
  ];
}).s("AmazonS3", "ListObjectsV2", {}).n("S3Client", "ListObjectsV2Command").f(void 0, void 0).ser(se_ListObjectsV2Command).de(de_ListObjectsV2Command).build() {
};

// node_modules/@aws-sdk/client-s3/dist-es/commands/PutObjectCommand.js
var PutObjectCommand = class extends Command.classBuilder().ep({
  ...commonParams,
  Bucket: { type: "contextParams", name: "Bucket" },
  Key: { type: "contextParams", name: "Key" }
}).m(function(Command2, cs2, config, o2) {
  return [
    getSerdePlugin(config, this.serialize, this.deserialize),
    getEndpointPlugin(config, Command2.getEndpointParameterInstructions()),
    getCheckContentLengthHeaderPlugin(config),
    getSsecPlugin(config),
    getFlexibleChecksumsPlugin(config, {
      input: this.input,
      requestAlgorithmMember: "ChecksumAlgorithm",
      requestChecksumRequired: false
    })
  ];
}).s("AmazonS3", "PutObject", {}).n("S3Client", "PutObjectCommand").f(PutObjectRequestFilterSensitiveLog, PutObjectOutputFilterSensitiveLog).ser(se_PutObjectCommand).de(de_PutObjectCommand).build() {
};
export {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
};
/*! Bundled license information:

tslib/tslib.es6.js:
tslib/tslib.es6.js:
tslib/tslib.es6.js:
tslib/tslib.es6.js:
tslib/tslib.es6.js:
tslib/tslib.es6.js:
tslib/tslib.es6.js:
  (*! *****************************************************************************
  Copyright (c) Microsoft Corporation.
  
  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted.
  
  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
  PERFORMANCE OF THIS SOFTWARE.
  ***************************************************************************** *)
*/
