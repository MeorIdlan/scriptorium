// CSS lookups for tests that guard the stylesheet

// The body of the first rule for `selector` inside an @media block whose query is `query`
export function ruleIn(css, query, selector) {
  for (const match of css.matchAll(/@media\s+([^{]+)\{/g)) {
    if (match[1].trim() !== query) continue;
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    const block = css.slice(start, i - 1);
    const rule = block.match(new RegExp(`(?:^|[\\s,}])${selector.replace('.', '\\.')}\\s*(?:,[^{]*)?\\{([^}]*)\\}`));
    if (rule) return rule[1];
  }
  return null;
}
