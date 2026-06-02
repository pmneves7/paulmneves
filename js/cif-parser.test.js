const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/cif-parser.js", "utf8");
const context = {};
context.window = context;
context.global = context;
vm.runInNewContext(source, context);

const parsed = context.parseCif(`
data_test
_cell_length_a 8.24062(11) # inline uncertainty plus comment
_cell_length_b 8.24062(11)
_cell_length_c 8.24062(11)
_cell_angle_alpha 90.
_cell_angle_beta 90.
_cell_angle_gamma 90.
_space_group_name_H-M_alt 'F d -3 m Z'
_space_group_IT_number 227
_chemical_formula_sum 'Li1 O4 V2' # comment after quoted value
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Li1 Li 0.125 0.125 0.125
V1 V 0.5 0.5 0.5
O1 O 0.2612 0.2612 0.2612
`);

assert.strictEqual(parsed.a, 8.24062);
assert.strictEqual(parsed.spaceGroupNameRaw, "F d -3 m Z");
assert.strictEqual(parsed.spaceGroupName, "F d -3 m");
assert.strictEqual(parsed.spaceGroupNumber, 227);
assert.strictEqual(parsed.chemicalFormula, "Li1 O4 V2");
assert.strictEqual(parsed.atoms.length, 3);
assert.strictEqual(parsed.atoms.map((atom) => atom.element).join(","), "Li,V,O");
