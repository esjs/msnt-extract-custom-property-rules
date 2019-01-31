const fs = require('fs-extra');
const path = require('path');

const postcss = require('postcss');

// holds resulting CSS
const extractedContent = postcss.root();
const existingRules = {};

let currentAtRule = null;
let currentRule = null;

let outputPaths = [];
let filename = 'output';
let ext = 'css';

let totalFiles = 0;
let processedFiles = 0;

let ruleWithCustomPropertyRegExtp = /var\(\s*--/;
let whiteListRegExp = null;

function validateAndPrepareSettings(options) {
  if (!options) throw new Error('Options object is required');

  let dist = options.dist || './';

  if (typeof dist === 'string') {
    dist = [dist];
  }

  if (options.whitelist) {
    if (Object.prototype.toString.call(options.whitelist) !== '[object Array]') {
      throw new Error(`"whitelist" options should be an array, but you passed ${options.whitelist}`)
    }

    whiteListRegExp = new RegExp(`var\\(\\s*(?:(?:${options.whitelist.join(')|(?:')}))\\s*\\)`);
  }

  outputPaths = dist.map(curDist => path.resolve(process.cwd(), curDist));

  if (options.filename) {
    filename = options.filename;
  }

  if (options.ext) {
    ext = options.ext;
  }
}

module.exports = postcss.plugin("postcss-reexport", function(options) {
  currentAtRule = null;
  currentRule = null;

  validateAndPrepareSettings(options);

  totalFiles = options.totalCount;
  
  return function(styles, result) {
    if (
      Array.isArray(options.excludeFiles) && options.excludeFiles.includes(styles.source.input.file)
    ) return;

    styles.walkDecls(decl => {
      // we are only interested in rules that have custom properties
      if (!ruleWithCustomPropertyRegExtp.test(decl.value)) {
        if (currentRule && currentRule.selector !== decl.parent.selector) {
          currentRule = null;
        }
        return;
      }

      if (whiteListRegExp) {
        if (!whiteListRegExp.test(decl.value)) return;
      }

      if (updateCurrentItemsSkipExisting(decl)) return;

      currentRule.append(decl.clone());
    });

    processedFiles++;

    // do not output file if it's not the last file
    if (totalFiles > processedFiles) return;

    outputPaths.forEach(path => {
      fs.outputFile(`${path}/${filename}.${ext}`, extractedContent.toString());
    })
  }

  function isCurrentAtRuleChanged(target) {
    return currentAtRule.name !== target.name || currentAtRule.params !== target.params
  }

  function getExistingRule(atRule, rule) {
    let selector = '';

    if (atRule) {
      selector += `${atRule.name}_${atRule.params}-`;
    }

    selector += rule.selectors.join('_');

    return existingRules[selector];
  }

  function ruleContainsDeclaration(rule, decl) {
    return rule.some(def => def.prop === decl.prop && def.value === decl.value);
  }
  
  function updateCurrentItemsSkipExisting(decl) {
    const rule = decl.parent;
    const atRule = rule.parent.type === 'atrule' ? rule.parent : null;
  
    const existingRule = getExistingRule(atRule, rule);

    if (existingRule) {
      // we already have this rule in existingRules
      if(ruleContainsDeclaration(existingRule, decl)) return true;

      currentRule = existingRule;
    }

    const noRuleOrChanged = !currentRule || currentRule.selector !== rule.selector;
    const isAtRuleChanged = currentAtRule && (!atRule || isCurrentAtRuleChanged(atRule));
    
    if (noRuleOrChanged || isAtRuleChanged) {
      // create copy of the rule
      currentRule = postcss.rule({
        selector: rule.selector,
        selectors: rule.selectors,
      })
  
      if (!atRule) {
        currentAtRule = null;
        extractedContent.append(currentRule);
        existingRules[currentRule.selectors.join('_')] = currentRule;
      } else {
        if (!currentAtRule) {
          currentAtRule = postcss.atRule({
            name: atRule.name,
            params: atRule.params,
          });
          extractedContent.append(currentAtRule);
        } else if (isCurrentAtRuleChanged(atRule)) {
          currentAtRule = postcss.atRule({
            name: atRule.name,
            params: atRule.params,
          });
          extractedContent.append(currentAtRule);
        }
  
        currentAtRule.append(currentRule);
        const uniqueId = `${currentAtRule.name}_${currentAtRule.params}-${currentRule.selectors.join('_')}`
        existingRules[uniqueId] = currentRule;
      }
    }
  }
});
