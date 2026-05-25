const form = document.getElementById("error-propagation-form");
const formulaInput = document.getElementById("formula");
const summary = document.getElementById("uncertainty-summary");
const result = document.getElementById("uncertainty-result");
const details = document.getElementById("uncertainty-details");

const FUNCTIONS = new Set(["sin", "cos", "tan", "exp", "log", "ln", "sqrt"]);

function number(value) {
  return { type: "number", value };
}

function identifier(name) {
  return { type: "identifier", name };
}

function unary(op, argument) {
  return { type: "unary", op, argument };
}

function binary(op, left, right) {
  return { type: "binary", op, left, right };
}

function func(name, argument) {
  return { type: "function", name, argument };
}

function tokenize(input) {
  const tokens = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const rest = input.slice(index);
    const numberMatch = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (numberMatch) {
      tokens.push({ type: "number", value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = rest.match(/^[A-Za-z][A-Za-z0-9_]*/);
    if (identifierMatch) {
      tokens.push({ type: "identifier", value: identifierMatch[0] });
      index += identifierMatch[0].length;
      continue;
    }

    if ("+-*/^(),".includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    throw new Error(`Unexpected character "${char}".`);
  }

  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  peek() {
    return this.tokens[this.position] || null;
  }

  match(type) {
    if (this.peek()?.type !== type) return false;
    this.position += 1;
    return true;
  }

  consume(type, message) {
    const token = this.peek();
    if (token?.type !== type) throw new Error(message);
    this.position += 1;
    return token;
  }

  parse() {
    const expression = this.parseAdditive();
    if (this.peek()) throw new Error(`Unexpected token "${this.peek().value}".`);
    return expression;
  }

  parseAdditive() {
    let expression = this.parseMultiplicative();

    while (this.peek()?.type === "+" || this.peek()?.type === "-") {
      const op = this.peek().type;
      this.position += 1;
      expression = binary(op, expression, this.parseMultiplicative());
    }

    return expression;
  }

  parseMultiplicative() {
    let expression = this.parsePower();

    while (this.peek()?.type === "*" || this.peek()?.type === "/") {
      const op = this.peek().type;
      this.position += 1;
      expression = binary(op, expression, this.parsePower());
    }

    return expression;
  }

  parsePower() {
    const expression = this.parseUnary();
    if (!this.match("^")) return expression;
    return binary("^", expression, this.parsePower());
  }

  parseUnary() {
    if (this.match("+")) return this.parseUnary();
    if (this.match("-")) return unary("-", this.parseUnary());
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.peek();
    if (!token) throw new Error("Expected an expression.");

    if (this.match("number")) return number(token.value);

    if (this.match("identifier")) {
      if (!this.match("(")) return identifier(token.value);
      if (!FUNCTIONS.has(token.value)) throw new Error(`Unsupported function "${token.value}".`);
      const argument = this.parseAdditive();
      this.consume(")", `Expected ")" after ${token.value} argument.`);
      return func(token.value, argument);
    }

    if (this.match("(")) {
      const expression = this.parseAdditive();
      this.consume(")", "Expected closing parenthesis.");
      return expression;
    }

    throw new Error(`Unexpected token "${token.value}".`);
  }
}

function parseFormula(rawFormula) {
  const parts = rawFormula.split("=");
  if (parts.length !== 2) throw new Error("Enter a single equation such as y=x+z.");

  const lhs = parts[0].trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(lhs)) {
    throw new Error("The left side should be a single output symbol such as y.");
  }

  const rhs = parts[1].trim();
  if (!rhs) throw new Error("Enter an expression on the right side of the equation.");

  return {
    lhs,
    rhs: new Parser(tokenize(rhs)).parse()
  };
}

function isUncertainVariableName(name, outputName) {
  return /^[a-z]/.test(name) && name !== outputName;
}

function collectVariables(expression, outputName, names = new Set()) {
  if (expression.type === "identifier" && isUncertainVariableName(expression.name, outputName)) {
    names.add(expression.name);
  }

  if (expression.type === "unary") collectVariables(expression.argument, outputName, names);
  if (expression.type === "function") collectVariables(expression.argument, outputName, names);
  if (expression.type === "binary") {
    collectVariables(expression.left, outputName, names);
    collectVariables(expression.right, outputName, names);
  }

  return [...names].sort();
}

function isNumber(expression, value) {
  return expression.type === "number" && expression.value === value;
}

function sameExpression(left, right) {
  return formatExpression(left) === formatExpression(right);
}

function expressionKey(expression) {
  if (expression.type === "number") return `number:${formatNumber(expression.value)}`;
  if (expression.type === "identifier") return `identifier:${expression.name}`;
  if (expression.type === "unary") return `unary:${expression.op}:${expressionKey(expression.argument)}`;
  if (expression.type === "function") return `function:${expression.name}:${expressionKey(expression.argument)}`;
  return `binary:${expression.op}:${expressionKey(expression.left)}:${expressionKey(expression.right)}`;
}

function addFactor(factors, base, exponent) {
  if (exponent === 0) return;

  const key = expressionKey(base);
  const current = factors.get(key);
  if (current) {
    current.exponent += exponent;
    if (current.exponent === 0) factors.delete(key);
    return;
  }

  factors.set(key, { base, exponent });
}

function collectProduct(expression, multiplier = 1, parts = { coefficient: 1, factors: new Map() }) {
  if (expression.type === "number") {
    parts.coefficient *= expression.value ** multiplier;
    return parts;
  }

  if (expression.type === "unary" && expression.op === "-") {
    parts.coefficient *= -1;
    collectProduct(expression.argument, multiplier, parts);
    return parts;
  }

  if (expression.type === "binary" && expression.op === "*") {
    collectProduct(expression.left, multiplier, parts);
    collectProduct(expression.right, multiplier, parts);
    return parts;
  }

  if (expression.type === "binary" && expression.op === "/") {
    collectProduct(expression.left, multiplier, parts);
    collectProduct(expression.right, -multiplier, parts);
    return parts;
  }

  if (expression.type === "binary" && expression.op === "^" && expression.right.type === "number") {
    addFactor(parts.factors, expression.left, expression.right.value * multiplier);
    return parts;
  }

  addFactor(parts.factors, expression, multiplier);
  return parts;
}

function factorExpression(base, exponent) {
  return exponent === 1 ? base : binary("^", base, number(exponent));
}

function multiplyExpressions(expressions) {
  if (!expressions.length) return number(1);
  return expressions.reduce((product, expression) => binary("*", product, expression));
}

function factorSortLabel(expression) {
  const label = formatExpression(expression);
  return label.startsWith("e_") ? `zz_${label}` : label;
}

function sortedFactors(parts, predicate) {
  return [...parts.factors.values()]
    .filter(({ exponent }) => predicate(exponent))
    .sort((a, b) => factorSortLabel(a.base).localeCompare(factorSortLabel(b.base)));
}

function simplifyProduct(expression) {
  const parts = collectProduct(expression);
  if (!Number.isFinite(parts.coefficient)) return expression;
  if (parts.coefficient === 0) return number(0);

  const numeratorFactors = sortedFactors(parts, (exponent) => exponent > 0)
    .map(({ base, exponent }) => factorExpression(base, exponent));
  const denominatorFactors = sortedFactors(parts, (exponent) => exponent < 0)
    .map(({ base, exponent }) => factorExpression(base, -exponent));

  const coefficientMagnitude = Math.abs(parts.coefficient);
  if (coefficientMagnitude !== 1 || !numeratorFactors.length) {
    numeratorFactors.unshift(number(coefficientMagnitude));
  }

  let numerator = multiplyExpressions(numeratorFactors);
  if (parts.coefficient < 0) numerator = unary("-", numerator);

  if (!denominatorFactors.length) return numerator;
  return binary("/", numerator, multiplyExpressions(denominatorFactors));
}

function splitCoefficient(expression) {
  const parts = collectProduct(expression);
  const restFactors = sortedFactors(parts, () => true)
    .map(({ base, exponent }) => factorExpression(base, exponent));

  return {
    coefficient: parts.coefficient,
    rest: simplifyProduct(multiplyExpressions(restFactors))
  };
}

function collectSum(expression, multiplier = 1, terms = new Map()) {
  if (expression.type === "binary" && expression.op === "+") {
    collectSum(expression.left, multiplier, terms);
    collectSum(expression.right, multiplier, terms);
    return terms;
  }

  if (expression.type === "binary" && expression.op === "-") {
    collectSum(expression.left, multiplier, terms);
    collectSum(expression.right, -multiplier, terms);
    return terms;
  }

  if (expression.type === "unary" && expression.op === "-") {
    collectSum(expression.argument, -multiplier, terms);
    return terms;
  }

  const { coefficient, rest } = splitCoefficient(expression);
  const key = expressionKey(rest);
  const current = terms.get(key) || { coefficient: 0, rest };
  current.coefficient += coefficient * multiplier;
  terms.set(key, current);
  return terms;
}

function simplifySum(expression) {
  const terms = [...collectSum(expression).values()]
    .filter(({ coefficient }) => coefficient !== 0);

  if (!terms.length) return number(0);

  const expressions = terms
    .sort((a, b) => formatExpression(a.rest).localeCompare(formatExpression(b.rest)))
    .map(({ coefficient, rest }) => {
      if (isNumber(rest, 1)) return number(coefficient);
      if (coefficient === 1) return rest;
      if (coefficient === -1) return unary("-", rest);
      return binary("*", number(coefficient), rest);
    });

  return expressions.reduce((sum, expression) => binary("+", sum, expression));
}

function simplify(expression) {
  if (expression.type === "number" || expression.type === "identifier") return expression;
  if (expression.type === "function") return func(expression.name, simplify(expression.argument));

  if (expression.type === "unary") {
    const argument = simplify(expression.argument);
    if (argument.type === "number") return number(-argument.value);
    if (argument.type === "unary" && argument.op === "-") return argument.argument;
    return unary("-", argument);
  }

  const left = simplify(expression.left);
  const right = simplify(expression.right);

  if (left.type === "number" && right.type === "number") {
    if (expression.op === "+") return number(left.value + right.value);
    if (expression.op === "-") return number(left.value - right.value);
    if (expression.op === "*") return number(left.value * right.value);
    if (expression.op === "/" && right.value !== 0) return number(left.value / right.value);
    if (expression.op === "^") return number(left.value ** right.value);
  }

  if (expression.op === "+") {
    if (isNumber(left, 0)) return right;
    if (isNumber(right, 0)) return left;
    if (sameExpression(left, right)) return binary("*", number(2), left);
    return simplifySum(binary("+", left, right));
  }

  if (expression.op === "-") {
    if (isNumber(right, 0)) return left;
    if (isNumber(left, 0)) return simplify(unary("-", right));
    if (sameExpression(left, right)) return number(0);
    return simplifySum(binary("-", left, right));
  }

  if (expression.op === "*") {
    if (isNumber(left, 0) || isNumber(right, 0)) return number(0);
    if (isNumber(left, 1)) return right;
    if (isNumber(right, 1)) return left;
    if (isNumber(left, -1)) return simplify(unary("-", right));
    if (isNumber(right, -1)) return simplify(unary("-", left));
    return simplifyProduct(binary("*", left, right));
  }

  if (expression.op === "/") {
    if (isNumber(left, 0)) return number(0);
    if (isNumber(right, 1)) return left;
    if (sameExpression(left, right)) return number(1);
    return simplifyProduct(binary("/", left, right));
  }

  if (expression.op === "^") {
    if (left.type === "binary" && left.op === "^" && left.right.type === "number" && right.type === "number") {
      return simplify(binary("^", left.left, number(left.right.value * right.value)));
    }
    if (isNumber(right, 0)) return number(1);
    if (isNumber(right, 1)) return left;
    if (isNumber(left, 0)) return number(0);
    if (isNumber(left, 1)) return number(1);
  }

  return binary(expression.op, left, right);
}

function derivative(expression, variable) {
  if (expression.type === "number") return number(0);
  if (expression.type === "identifier") return number(expression.name === variable ? 1 : 0);

  if (expression.type === "unary") {
    return simplify(unary("-", derivative(expression.argument, variable)));
  }

  if (expression.type === "function") {
    const argumentDerivative = derivative(expression.argument, variable);
    const argument = expression.argument;

    if (expression.name === "sin") return simplify(binary("*", func("cos", argument), argumentDerivative));
    if (expression.name === "cos") return simplify(binary("*", unary("-", func("sin", argument)), argumentDerivative));
    if (expression.name === "tan") {
      return simplify(binary("/", argumentDerivative, binary("^", func("cos", argument), number(2))));
    }
    if (expression.name === "exp") return simplify(binary("*", func("exp", argument), argumentDerivative));
    if (expression.name === "log" || expression.name === "ln") return simplify(binary("/", argumentDerivative, argument));
    if (expression.name === "sqrt") {
      return simplify(binary("/", argumentDerivative, binary("*", number(2), func("sqrt", argument))));
    }
  }

  const u = expression.left;
  const v = expression.right;
  const du = derivative(u, variable);
  const dv = derivative(v, variable);

  if (expression.op === "+") return simplify(binary("+", du, dv));
  if (expression.op === "-") return simplify(binary("-", du, dv));
  if (expression.op === "*") {
    return simplify(binary("+", binary("*", du, v), binary("*", u, dv)));
  }
  if (expression.op === "/") {
    return simplify(binary("/", binary("-", binary("*", du, v), binary("*", u, dv)), binary("^", v, number(2))));
  }
  if (expression.op === "^") {
    if (v.type === "number") {
      return simplify(binary("*", binary("*", number(v.value), binary("^", u, number(v.value - 1))), du));
    }

    return simplify(binary("*", binary("^", u, v), binary("+", binary("*", dv, func("ln", u)), binary("*", v, binary("/", du, u)))));
  }

  return number(0);
}

function precedence(expression) {
  if (expression.type === "number" || expression.type === "identifier" || expression.type === "function") return 5;
  if (expression.type === "unary") return 4;
  if (expression.op === "^") return 3;
  if (expression.op === "*" || expression.op === "/") return 2;
  return 1;
}

function formatNumber(value) {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toPrecision(8)).toString();
}

function formatExpression(expression, parentPrecedence = 0) {
  const simplified = simplify(expression);
  let text = "";

  if (simplified.type === "number") text = formatNumber(simplified.value);
  if (simplified.type === "identifier") text = simplified.name;
  if (simplified.type === "function") {
    text = `${simplified.name}(${formatExpression(simplified.argument)})`;
  }
  if (simplified.type === "unary") {
    const argumentPrecedence = simplified.argument.type === "binary"
      && (simplified.argument.op === "+" || simplified.argument.op === "-")
      ? precedence(simplified)
      : precedence(simplified.argument);
    text = `-${formatExpression(simplified.argument, argumentPrecedence)}`;
  }
  if (simplified.type === "binary") {
    const currentPrecedence = precedence(simplified);
    const left = formatExpression(simplified.left, currentPrecedence);
    const rightPrecedence = simplified.op === "^" || simplified.op === "-" || simplified.op === "/"
      ? currentPrecedence + 1
      : currentPrecedence;
    const right = formatExpression(simplified.right, rightPrecedence);
    text = `${left}${simplified.op}${right}`;
  }

  return precedence(simplified) < parentPrecedence ? `(${text})` : text;
}

function formatUncertaintyTerm(partial, variable) {
  const simplifiedPartial = simplify(partial);
  if (isNumber(simplifiedPartial, 1) || isNumber(simplifiedPartial, -1)) {
    return `e_${variable}^2`;
  }

  const formattedPartial = simplifiedPartial.type === "binary"
    && (simplifiedPartial.op === "+" || simplifiedPartial.op === "-")
    ? `(${formatExpression(simplifiedPartial)})`
    : formatExpression(simplifiedPartial);

  return `(${formattedPartial}*e_${variable})^2`;
}

function cloneFactorMap(factors) {
  const clone = new Map();
  factors.forEach(({ base, exponent }, key) => {
    clone.set(key, { base, exponent });
  });
  return clone;
}

function makePositiveProductParts(expression) {
  const parts = collectProduct(simplify(expression));
  parts.coefficient = Math.abs(parts.coefficient);
  parts.factors = cloneFactorMap(parts.factors);
  return parts;
}

function commonSignedExponent(exponents) {
  if (exponents.every((exponent) => exponent > 0)) return Math.min(...exponents);
  if (exponents.every((exponent) => exponent < 0)) return Math.max(...exponents);
  return 0;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x;
}

function commonNumericCoefficient(coefficients) {
  if (!coefficients.length) return 1;
  if (coefficients.every((coefficient) => Number.isInteger(coefficient))) {
    return coefficients.reduce((common, coefficient) => gcd(common, coefficient));
  }

  const [first] = coefficients;
  return coefficients.every((coefficient) => coefficient === first) ? first : 1;
}

function commonFactorParts(termParts) {
  const commonFactors = new Map();
  const candidateKeys = new Set(termParts.flatMap((parts) => [...parts.factors.keys()]));

  candidateKeys.forEach((key) => {
    const exponents = termParts.map((parts) => parts.factors.get(key)?.exponent || 0);
    const commonExponent = commonSignedExponent(exponents);
    if (commonExponent !== 0) {
      commonFactors.set(key, {
        base: termParts.find((parts) => parts.factors.has(key)).factors.get(key).base,
        exponent: commonExponent
      });
    }
  });

  return {
    coefficient: commonNumericCoefficient(termParts.map(({ coefficient }) => coefficient)),
    factors: commonFactors
  };
}

function expressionFromParts(parts) {
  const positiveFactors = sortedFactors(parts, (exponent) => exponent > 0)
    .map(({ base, exponent }) => factorExpression(base, exponent));
  const negativeFactors = sortedFactors(parts, (exponent) => exponent < 0)
    .map(({ base, exponent }) => factorExpression(base, -exponent));

  if (parts.coefficient !== 1 || !positiveFactors.length) {
    positiveFactors.unshift(number(parts.coefficient));
  }

  const numerator = multiplyExpressions(positiveFactors);
  if (!negativeFactors.length) return simplify(numerator);
  return simplify(binary("/", numerator, multiplyExpressions(negativeFactors)));
}

function removeCommonFactors(parts, common) {
  const remaining = {
    coefficient: parts.coefficient / common.coefficient,
    factors: cloneFactorMap(parts.factors)
  };

  common.factors.forEach(({ exponent }, key) => {
    const current = remaining.factors.get(key);
    if (!current) return;
    current.exponent -= exponent;
    if (current.exponent === 0) remaining.factors.delete(key);
  });

  return remaining;
}

function formatSquaredTerm(expression) {
  const simplified = simplify(expression);
  if (isNumber(simplified, 1) || isNumber(simplified, -1)) return "1";
  if (simplified.type === "identifier") return `${formatExpression(simplified)}^2`;
  return `(${formatExpression(simplified)})^2`;
}

function formatAbsoluteExpression(expression) {
  const parts = makePositiveProductParts(expression);
  const coefficient = parts.coefficient;
  const rest = expressionFromParts({ coefficient: 1, factors: parts.factors });

  if (isNumber(rest, 1)) return formatNumber(coefficient);

  const formattedRest = `abs(${formatExpression(rest)})`;
  return coefficient === 1 ? formattedRest : `${formatNumber(coefficient)}*${formattedRest}`;
}

function formatUncertainty(lhs, partials) {
  const termParts = partials.map(({ partial, variable }) => (
    makePositiveProductParts(binary("*", partial, identifier(`e_${variable}`)))
  ));

  if (termParts.length === 1) {
    return `e_${lhs} = ${formatAbsoluteExpression(expressionFromParts(termParts[0]))}`;
  }

  const common = commonFactorParts(termParts);
  const commonExpression = expressionFromParts(common);
  const reducedTerms = termParts.map((parts) => expressionFromParts(removeCommonFactors(parts, common)));
  const root = `sqrt(${reducedTerms.map(formatSquaredTerm).join("+")})`;

  if (isNumber(commonExpression, 1)) return `e_${lhs} = ${root}`;
  return `e_${lhs} = ${formatAbsoluteExpression(commonExpression)}*${root}`;
}

function renderPropagation() {
  try {
    const { lhs, rhs } = parseFormula(formulaInput.value);
    const variables = collectVariables(rhs, lhs);
    const partials = variables.map((variable) => ({
      variable,
      partial: simplify(derivative(rhs, variable))
    })).filter(({ partial }) => !isNumber(partial, 0));

    if (!partials.length) {
      summary.textContent = "No uncertain lowercase variables found on the right side.";
      result.textContent = `e_${lhs} = 0`;
      details.innerHTML = "";
      return;
    }

    summary.textContent = `Propagating ${partials.map(({ variable }) => `e_${variable}`).join(", ")}.`;
    result.textContent = formatUncertainty(lhs, partials);
    details.innerHTML = `
      <h3>Partial derivatives</h3>
      <ul>
        ${partials.map(({ variable, partial }) => `<li>∂${lhs}/∂${variable} = ${formatExpression(partial)}</li>`).join("")}
      </ul>
    `;
  } catch (error) {
    summary.textContent = "Could not parse the formula.";
    result.textContent = error.message;
    details.innerHTML = "";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderPropagation();
});

formulaInput.addEventListener("input", renderPropagation);
renderPropagation();
