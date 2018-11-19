const fs = require('fs-extra');
const path = require('path');

const postcss = require('postcss');

// holds resulting CSS
const extractedContent = postcss.root();

let currentAtRule = null;
let currentRule = null;

let outputPaths = [];
let filename = 'output';
let ext = 'css';

function validateAndPrepareSettings(options) {
  if (!options) throw new Error('Options object is required');

  let dist = options.dist || './';

  if (typeof dist === 'string') {
    dist = [dist];
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
  validateAndPrepareSettings(options);
  
  return function(styles, result) {
    styles.walkDecls(decl => {
      // we are only interested in rules that have custom properties
      if (!decl.value.includes('var(--')) {
        if (currentRule && currentRule.selector !== decl.parent.selector) {
          currentRule = null;
        }
        return;
      }

      updateCurrentItems(decl);

      currentRule.append(decl.clone());
    });

    outputPaths.forEach(path => {
      fs.outputFile(`${path}/${filename}.${ext}`, extractedContent.toString());
    })
  }
});

function isCurrentAtRuleChanged(target) {
  return currentAtRule.name !== target.name || currentAtRule.params !== target.params
}

function updateCurrentItems(decl) {
  const rule = decl.parent;
  const atRule = rule.parent.type === 'atrule' ? rule.parent : null;

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
    }
  }
}