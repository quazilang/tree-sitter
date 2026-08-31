// Tree-sitter grammar for the Quazi programming language.
// Run `tree-sitter generate` to produce src/parser.c

module.exports = grammar({
  name: 'quazi',

  extras: $ => [/\s+/, $.comment],

  word: $ => $.identifier,

  conflicts: $ => [
    [$._expr, $.named_type],
    [$.match_stmt, $.match_expr],
    [$._expr, $.struct_lit],
    [$._expr, $.qualified_identifier],
    [$.import_path],
    [$.qualified_identifier],
    [$.named_type],
    [$.if_stmt, $.paren_expr],
    [$.while_stmt, $.paren_expr],
    [$.fn_type],
  ],

  rules: {
    source_file: $ => repeat($._item),

    comment: $ => token(seq('//', /.*/)),

    // ── Top-level items ───────────────────────────────────────────────────────

    _item: $ => choice(
      $.import_decl,
      $.fn_decl,
      $.struct_decl,
      $.union_decl,
      $.trait_decl,
      $.enum_decl,
      $.impl_decl,
      $.type_alias,
      $.foreign_global,
    ),

    // import a.b.{x, y};  /  import a.b.*;  /  import a.b as c;  /  import a.b;
    import_decl: $ => seq(
      optional('pub'),
      'import',
      $.import_path,
      optional(choice(
        seq('.', $.glob_import),
        seq('.', $.multi_import),
        seq('as', $.identifier),
      )),
      ';',
    ),
    import_path: $ => seq($.identifier, repeat(seq('.', $.identifier))),
    glob_import: $ => '*',
    multi_import: $ => seq('{', commaSep1($.identifier), '}'),

    // ── Attributes ────────────────────────────────────────────────────────────

    attribute: $ => seq(
      '@',
      field('name', $.identifier),
      optional(seq('(', commaSep($.attr_arg), optional(','), ')')),
    ),

    attr_arg: $ => choice(
      seq($.identifier, '=', $._attr_value),
      $._attr_value,
    ),

    _attr_value: $ => choice($.string_literal, $.integer_literal, $.identifier),

    // ── Function declaration ─────────────────────────────────────────────────

    fn_decl: $ => seq(
      repeat($.attribute),
      optional('pub'),
      optional('unsafe'),
      'fn',
      field('name', $.identifier),
      optional($.generic_params),
      '(',
      commaSep($.param),
      ')',
      optional(field('return_type', $._type)),
      choice($.block, ';'),
    ),

    generic_params: $ => seq('[', commaSep1($.identifier), ']'),

    param: $ => choice(
      seq(
        repeat($.attribute),
        field('name', $.identifier),
        ':',
        field('type', $._type),
      ),
      '...',
      seq(
        '...',
        field('name', $.identifier),
        ':',
        field('type', $._type),
      ),
    ),

    // ── Struct ────────────────────────────────────────────────────────────────

    struct_decl: $ => seq(
      repeat($.attribute),
      optional('pub'),
      'struct',
      field('name', $.identifier),
      optional($.generic_params),
      '{',
      commaSep($.struct_field),
      optional(','),
      '}',
    ),

    struct_field: $ => seq(
      optional('const'),
      field('name', $.identifier),
      ':',
      field('type', $._type),
      // Field attributes are opaque metadata. Keep them in the concrete tree
      // even when this grammar does not know their community-defined meaning.
      repeat($.attribute),
      optional(seq(
        ':',
        field('bit_width', $.integer_literal),
        repeat($.attribute),
      )),
    ),

    union_decl: $ => seq(
      repeat($.attribute),
      optional('pub'),
      'union',
      field('name', $.identifier),
      optional($.generic_params),
      '{',
      commaSep($.struct_field),
      optional(','),
      '}',
    ),

    // ── Trait ─────────────────────────────────────────────────────────────────

    trait_decl: $ => seq(
      repeat($.attribute),
      optional('pub'),
      'trait',
      field('name', $.identifier),
      optional($.generic_params),
      '{',
      repeat($.trait_method),
      '}',
    ),

    trait_method: $ => seq(
      'fn',
      field('name', $.identifier),
      optional($.generic_params),
      '(',
      commaSep($.param),
      ')',
      optional(field('return_type', $._type)),
      ';',
    ),

    // ── Enum ──────────────────────────────────────────────────────────────────

    enum_decl: $ => seq(
      repeat($.attribute),
      optional('pub'),
      'enum',
      field('name', $.identifier),
      optional($.generic_params),
      '{',
      commaSep($.enum_variant),
      optional(','),
      '}',
    ),

    enum_variant: $ => seq(
      field('name', $.identifier),
      optional(seq('(', commaSep($._type), ')')),
    ),

    // ── Impl ──────────────────────────────────────────────────────────────────

    impl_decl: $ => seq(
      'impl',
      field('first_type', $._type),
      optional(seq('for', field('for_type', $._type))),
      '{',
      repeat($.fn_decl),
      '}',
    ),

    type_alias: $ => seq(
      repeat($.attribute),
      optional('pub'),
      'type',
      field('name', $.identifier),
      optional($.generic_params),
      '=',
      field('value', $._type),
      ';',
    ),

    foreign_global: $ => seq(
      repeat($.attribute),
      optional('pub'),
      'var',
      field('name', $.identifier),
      ':',
      field('type', $._type),
      ';',
    ),

    // ── Statements ────────────────────────────────────────────────────────────

    block: $ => seq('{', repeat($._stmt), '}'),

    _stmt: $ => choice(
      $.var_stmt,
      $.const_stmt,
      $.return_stmt,
      $.if_stmt,
      $.for_stmt,
      $.while_stmt,
      $.match_stmt,
      $.cfg_block,
      $.unsafe_block,
      $.break_stmt,
      $.continue_stmt,
      $.expr_stmt,
    ),

    var_stmt: $ => seq(
      repeat($.attribute),
      'var',
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
      optional(seq('=', field('value', $._expr))),
      ';',
    ),

    const_stmt: $ => seq(
      repeat($.attribute),
      'const',
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $._expr),
      ';',
    ),

    return_stmt: $ => seq('ret', optional($._expr), ';'),
    break_stmt: $ => seq('break', ';'),
    continue_stmt: $ => seq('continue', ';'),

    if_stmt: $ => seq(
      'if',
      field('condition', choice(
        seq('(', $._expr, ')'),
        $._expr,
      )),
      field('then', $.block),
      optional(seq('else', choice($.block, $.if_stmt))),
    ),

    for_stmt: $ => seq(
      'for',
      choice(
        seq(
          field('var', $.identifier),
          optional(seq(',', field('idx', $.identifier))),
          ':',
          field('iter', $._expr),
          optional(seq('..', field('end', $._expr))),
        ),
        field('condition', $._expr),
      ),
      field('body', $.block),
    ),

    while_stmt: $ => seq(
      'while',
      field('condition', choice(
        seq('(', $._expr, ')'),
        $._expr,
      )),
      field('body', $.block),
    ),

    match_stmt: $ => seq(
      'match',
      field('value', $._expr),
      '{',
      commaSep($.match_arm),
      optional(','),
      '}',
      optional(';'),
    ),

    match_arm: $ => seq(
      field('pattern', $.match_pattern),
      '=>',
      field('body', $._expr),
    ),

    match_pattern: $ => choice(
      $.wildcard_pattern,
      $.literal_pattern,
      $.variant_pattern,
    ),

    wildcard_pattern: $ => '_',
    literal_pattern: $ => choice(
      $.integer_literal,
      $.float_literal,
      $.string_literal,
      $.bool_literal,
    ),
    variant_pattern: $ => seq(
      optional(seq(field('enum', $.identifier), '.')),
      field('name', $.identifier),
      optional(seq('(', commaSep($.match_pattern), ')')),
    ),

    cfg_block: $ => seq(
      '@cfg',
      '(',
      $.attr_arg,
      ')',
      $.block,
    ),

    unsafe_block: $ => seq('unsafe', $.block),

    expr_stmt: $ => seq($._expr, ';'),

    // ── Types ─────────────────────────────────────────────────────────────────

    _type: $ => choice(
      $._primitive_type,
      $.named_type,
      $.ref_type,
      $.ptr_type,
      $.array_type,
      $.slice_type,
      $.flexible_array_type,
      $.fn_type,
      $.dyn_type,
      $.never_type,
    ),

    _primitive_type: $ => choice(
      'i8', 'i16', 'i32', 'i64',
      'u8', 'u16', 'u32', 'u64',
      'isize', 'usize',
      'f16', 'f32', 'f64',
      'bool', 'str', 'bytes', 'void', 'any',
    ),

    named_type: $ => seq(
      $.qualified_identifier,
      optional(seq('[', commaSep1($._type), ']')),
    ),

    qualified_identifier: $ => seq($.identifier, repeat(seq('.', $.identifier))),
    ref_type: $ => seq('&', $._type),
    ptr_type: $ => choice(seq('*', $._type), seq('**', $._type)),
    array_type: $ => seq('[', $._type, ';', $.integer_literal, ']'),
    flexible_array_type: $ => seq('[', $._type, ';', '..', ']'),
    slice_type: $ => seq('[', $._type, ']'),
    fn_type: $ => seq('fn', '(', commaSep($._type), ')', optional($._type)),
    dyn_type: $ => seq('dyn', $.identifier),
    never_type: $ => '!',

    // ── Expressions (precedence climbing) ─────────────────────────────────────

    _expr: $ => choice(
      $.assign_expr,
      $.compound_assign_expr,
      $.binary_expr,
      $.unary_expr,
      $.postfix_expr,
      $.cast_expr,
      $.try_expr,
      $.call_expr,
      $.method_call_expr,
      $.field_expr,
      $.index_expr,
      $.slice_expr,
      $.match_expr,
      $.array_lit,
      $.struct_lit,
      $.closure_expr,
      $.range_expr,
      $.identifier,
      $.integer_literal,
      $.float_literal,
      $.string_literal,
      $.byte_string_literal,
      $.raw_string_literal,
      $.bool_literal,
      $.paren_expr,
    ),

    assign_expr: $ => prec.right(1, seq(
      field('lhs', $._expr),
      '=',
      field('rhs', $._expr),
    )),

    compound_assign_expr: $ => prec.right(1, seq(
      field('lhs', $._expr),
      field('op', choice('+=', '-=', '*=', '/=', '%=')),
      field('rhs', $._expr),
    )),

    binary_expr: $ => {
      const table = [
        [prec.left, 2,  '||'],
        [prec.left, 3,  '&&'],
        [prec.left, 4,  '|'],
        [prec.left, 5,  '^'],
        [prec.left, 6,  '&'],
        [prec.left, 7,  choice('==', '!=')],
        [prec.left, 8,  choice('<', '<=', '>', '>=')],
        [prec.left, 9,  choice('<<', '>>')],
        [prec.left, 10, choice('+', '-')],
        [prec.left, 11, choice('*', '/', '%')],
        [prec.right, 12, '**'],
      ];
      return choice(...table.map(([assoc, prec_n, op]) =>
        assoc(prec_n, seq(
          field('lhs', $._expr),
          field('op', op),
          field('rhs', $._expr),
        ))
      ));
    },

    unary_expr: $ => prec(13, seq(
      field('op', choice('-', '!', '~', '++', '--', '&', '*')),
      field('operand', $._expr),
    )),

    postfix_expr: $ => prec.left(14, seq(
      field('operand', $._expr),
      field('op', choice('++', '--')),
    )),

    call_expr: $ => prec.left(14, seq(
      field('callee', $._expr),
      optional(seq('[', commaSep1($._type), ']')),
      '(',
      commaSep($._expr),
      ')',
    )),

    method_call_expr: $ => prec.left(14, seq(
      field('receiver', $._expr),
      '.',
      field('method', $.identifier),
      optional(seq('[', commaSep1($._type), ']')),
      '(',
      commaSep($._expr),
      ')',
    )),

    field_expr: $ => prec.left(14, seq(
      field('object', $._expr),
      '.',
      field('field', $.identifier),
    )),

    index_expr: $ => prec.left(14, seq(
      field('object', $._expr),
      '[',
      field('index', $._expr),
      ']',
    )),

    slice_expr: $ => prec.left(14, seq(
      field('object', $._expr),
      '[',
      optional(field('start', $._expr)),
      ':',
      optional(field('end', $._expr)),
      optional(seq(':', optional(field('step', $._expr)))),
      ']',
    )),

    cast_expr: $ => prec.left(14, seq(
      field('value', $._expr),
      'as',
      field('type', $._type),
    )),

    try_expr: $ => prec.left(14, seq(
      field('value', $._expr),
      '?',
    )),

    match_expr: $ => seq(
      'match',
      field('value', $._expr),
      '{',
      commaSep($.match_arm),
      optional(','),
      '}',
    ),

    array_lit: $ => seq('[', commaSep($._expr), ']'),

    struct_lit: $ => seq(
      field('type', $.identifier),
      '{',
      commaSep($.struct_lit_field),
      optional(','),
      '}',
    ),
    struct_lit_field: $ => seq(
      field('name', $.identifier),
      ':',
      field('value', $._expr),
    ),

    closure_expr: $ => seq('|', commaSep($.identifier), '|', field('body', $._expr)),

    range_expr: $ => prec.left(9, seq(
      field('start', $._expr),
      choice('..', '..='),
      field('end', $._expr),
    )),

    paren_expr: $ => seq('(', $._expr, ')'),

    // ── Terminals ─────────────────────────────────────────────────────────────

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,
    integer_literal: $ => /[0-9]+/,
    float_literal: $ => /[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?/,
    string_literal: $ => /"([^"\\]|\\[\s\S])*"/,
    byte_string_literal: $ => /b"([^"\\]|\\.)*"/,
    raw_string_literal: $ => /`[^`]*`/,
    bool_literal: $ => choice('true', 'false'),
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
