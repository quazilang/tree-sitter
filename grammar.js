// Tree-sitter grammar for the Quazi programming language.
// Run `tree-sitter generate` to produce src/parser.c

module.exports = grammar({
  name: 'quazi',

  extras: $ => [/\s+/, $.comment],

  // `word` is the grammar's identifier-like production. Tree-sitter uses this
  // to implement keyword extraction: any literal keyword that matches the word
  // rule's pattern (e.g. `while`, `platform`) is automatically excluded from
  // the identifier rule, preventing them from being parsed as valid user names.
  word: $ => $.identifier,

  // Reserved keywords that do not appear in any other grammar rule but must
  // NOT be parsed as identifiers. Tree-sitter's keyword-extraction mechanism
  // (triggered by the `word` property above) automatically prevents any string
  // literal that appears anywhere in the grammar from matching the word rule's
  // pattern.  We introduce named underscore rules so these literals are
  // reachable from the grammar object and the extraction fires correctly.
  //
  // _kw_while   — `while` is a reserved keyword in the Quazi compiler (lexer
  //               emits TokenKind::While) but has no grammar production yet.
  // _kw_platform — `platform` is similarly reserved (TokenKind::Platform).
  //
  // These rules are intentionally unreachable from _item / _stmt / _expr so
  // they never appear in a real parse tree; they exist only to register the
  // literals with the Tree-sitter keyword extractor.

  conflicts: $ => [
    [$._expr, $.struct_lit],
    [$._expr, $.qualified_identifier],
    [$.import_path],
    [$.qualified_identifier],
    [$.named_type],
    [$.if_stmt, $.if_expr],
    [$.unary_expr, $.exclusive_ref_expr],
    [$.if_expr, $.paren_expr],
    [$.if_stmt, $.if_expr, $.paren_expr],
    [$.for_stmt, $._expr],
    [$._expr, $.named_arg],
    [$.fn_type],
    [$.ref_type],
  ],

  rules: {
    source_file: $ => repeat($._item),

    comment: $ => token(seq('//', /.*/)),

    // These rules exist solely to register `while` and `platform` as keywords
    // with Tree-sitter's keyword-extraction mechanism (see the `word` comment
    // above).  They are not reachable from any item/stmt/expression rule.
    _kw_while: $ => 'while',
    _kw_platform: $ => 'platform',

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

    // import ./a; / import a.b.{x, y}; / import a.b.*; / import a.b as c;
    // import a.b; The compiler also permits an empty selector list.
    import_decl: $ => seq(
      // Imports participate in target selection just like declarations.  Keep
      // arbitrary attributes in the concrete tree so editors do not report
      // valid `@cfg … import` forms as syntax errors.
      repeat($.attribute),
      optional('pub'),
      'import',
      optional(seq('.', '/')),
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
    multi_import: $ => seq('{', commaSep($.identifier), '}'),

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
      optional(choice(
        seq('pub', optional('unsafe')),
        seq('unsafe', optional('pub')),
      )),
      'fn',
      field('name', $.identifier),
      optional($.generic_params),
      '(',
      optional($._function_params),
      ')',
      optional(field('return_type', $._type)),
      choice($.block, ';'),
    ),

    generic_params: $ => seq('[', commaSep1($.identifier), ']'),

    // The compiler accepts a Quazi variadic parameter (`...rest: T`) or a
    // bare C variadic marker (`...`) only in the final position. Keep that
    // syntactic constraint here: accepting `fn f(..., x: T)` makes editors
    // treat a compiler parser error as a valid declaration.
    _function_params: $ => choice(
      commaSep1($.param),
      seq(
        commaSep1($.param),
        ',',
        choice($.variadic_param, $._c_variadic_param),
      ),
      $.variadic_param,
      $._c_variadic_param,
    ),

    param: $ => seq(
      repeat($.attribute),
      field('name', $.identifier),
      ':',
      field('type', $._type),
    ),

    variadic_param: $ => seq(
      repeat($.attribute),
      '...',
      field('name', $.identifier),
      ':',
      field('type', $._type),
    ),

    _c_variadic_param: $ => '...',

    // ── Struct ────────────────────────────────────────────────────────────────

    struct_decl: $ => seq(
      repeat($.attribute),
      optional('pub'),
      'struct',
      field('name', $.identifier),
      optional($.generic_params),
      '{',
      itemSep($.struct_field),
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
      itemSep($.struct_field),
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
      commaSep($.trait_param),
      ')',
      optional(field('return_type', $._type)),
      ';',
    ),

    // Trait declarations only accept named, attribute-free parameters. The
    // compiler deliberately keeps parameter attributes on function bodies,
    // not trait signatures.
    trait_param: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $._type),
    ),

    // ── Enum ──────────────────────────────────────────────────────────────────

    enum_decl: $ => seq(
      repeat($.attribute),
      optional('pub'),
      'enum',
      field('name', $.identifier),
      optional($.generic_params),
      '{',
      itemSep($.enum_variant),
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

    // The compiler accepts a block's final expression without `;` only as a
    // function-body tail (D-017); the grammar is deliberately permissive.
    block: $ => seq('{', repeat($._stmt), optional(field('tail', $._expr)), '}'),

    _stmt: $ => choice(
      $.var_stmt,
      $.const_stmt,
      $.return_stmt,
      $.if_stmt,
      $.for_stmt,
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

    if_stmt: $ => prec.dynamic(1, seq(
      'if',
      field('condition', choice(
        seq('(', $._expr, ')'),
        $._expr,
      )),
      field('then', $.block),
      optional(seq('else', choice($.block, $.if_stmt))),
    )),

    // Value-producing `if` (D-017): `else` is mandatory and each branch holds
    // one expression. Statement position prefers `if_stmt`.
    if_expr: $ => prec.right(seq(
      'if',
      field('condition', choice(
        seq('(', $._expr, ')'),
        $._expr,
      )),
      field('then', $.block),
      'else',
      field('else', choice($.block, $.if_expr)),
    )),

    for_stmt: $ => seq(
      'for',
      choice(
        // Compiler-supported iteration: `for var item : values {}` and
        // `for index, item : values {}`. `var` is optional in both forms.
        seq(
          optional('var'),
          field('var', $.identifier),
          optional(seq(',', field('idx', $.identifier))),
          ':',
          field('iter', $._expr),
        ),
        // C-style: `for var i = 0; cond; update {}` — var-decl initializer.
        seq(
          optional('var'),
          field('var', $.identifier),
          '=',
          field('init', $._expr),
          ';',
          optional(field('condition', $._expr)),
          ';',
          optional(field('update', $._expr)),
        ),
        // C-style: `for expr; cond; update {}` — arbitrary-expression initializer.
        // The compiler parses any expression as the initializer when no `var`
        // keyword is present and the init is followed by `;` (mod.rs:649-678).
        seq(
          field('init_expr', $._expr),
          ';',
          optional(field('condition', $._expr)),
          ';',
          optional(field('update', $._expr)),
        ),
        // C-style: `for ; cond; update {}` — empty initializer.
        seq(
          ';',
          optional(field('condition', $._expr)),
          ';',
          optional(field('update', $._expr)),
        ),
        blank(),
        field('condition', $._expr),
      ),
      field('body', $.block),
    ),

    match_arm: $ => seq(
      field('pattern', $.match_pattern),
      optional(seq('if', field('guard', $._expr))),
      '=>',
      field('body', $._expr),
    ),

    match_pattern: $ => choice(
      $.wildcard_pattern,
      $.literal_pattern,
      $.variant_pattern,
      $.struct_pattern,
    ),

    // `Point { x, y: 0, .. }` destructures a struct.
    struct_pattern: $ => seq(
      field('name', $.identifier),
      '{',
      commaSep(choice($.field_pattern, $.rest_pattern)),
      optional(','),
      '}',
    ),
    field_pattern: $ => seq(
      field('field', $.identifier),
      optional(seq(':', field('pattern', $.match_pattern))),
    ),
    rest_pattern: $ => '..',

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
      '@',
      'cfg',
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
    // `&Type` is a shared reference; `&Type!` is an exclusive (mutable)
    // reference. Both are parsed by the compiler in parse_type (mod.rs:1833-1850).
    ref_type: $ => seq('&', $._type, optional(field('exclusive', '!'))),
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
      $.qo_expr,
      $.exclusive_ref_expr,
      $.postfix_expr,
      $.cast_expr,
      $.try_expr,
      $.call_expr,
      $.method_call_expr,
      $.field_expr,
      $.index_expr,
      $.slice_expr,
      $.match_expr,
      $.if_expr,
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
      // Precedence levels are derived from the compiler's recursive-descent
      // call chain in quazistrap/src/parser/mod.rs (higher number = tighter):
      //   parse_logical_or  → parse_logical_and  → parse_equality
      //   → parse_comparison → parse_bitwise_or  → parse_bitwise_xor
      //   → parse_bitwise_and → parse_shift      → parse_term
      //   → parse_factor
      //
      // In the compiler, bitwise operators bind *tighter* than equality and
      // comparison: `a == b | c` parses as `a == (b | c)`, and `a < b & c`
      // parses as `a < (b & c)`. The table below matches this ordering.
      const table = [
        [prec.left, 3,  '||'],
        [prec.left, 4,  '&&'],
        [prec.left, 5,  choice('==', '!=')],     // equality
        [prec.left, 6,  choice('<', '<=', '>', '>=')], // comparison
        [prec.left, 7,  '|'],
        [prec.left, 8,  '^'],
        [prec.left, 9,  '&'],
        [prec.left, 10, choice('<<', '>>')],
        [prec.left, 11, choice('+', '-')],
        [prec.left, 12, choice('*', '/', '%')],
        [prec.right, 13, '**'],
      ];
      return choice(...table.map(([assoc, prec_n, op]) =>
        assoc(prec_n, seq(
          field('lhs', $._expr),
          field('op', op),
          field('rhs', $._expr),
        ))
      ));
    },

    unary_expr: $ => prec(14, seq(
      field('op', choice('-', '!', '++', '--', '&', '*')),
      field('operand', $._expr),
    )),

    // `qo f(args)` starts a qoroutine; the operand is a call (D-019).
    qo_expr: $ => prec(14, seq('qo', field('call', $.call_expr))),

    // `&value!` is an exclusive borrow; `!` is not otherwise postfix.
    exclusive_ref_expr: $ => prec(14, seq('&', field('operand', $._expr), '!')),

    postfix_expr: $ => prec.left(15, seq(
      field('operand', $._expr),
      field('op', choice('++', '--')),
    )),

    call_expr: $ => prec.left(15, seq(
      field('callee', $._expr),
      optional(seq('[', commaSep1($._type), ']')),
      '(',
      commaSep($.call_arg),
      ')',
    )),

    method_call_expr: $ => prec.left(15, seq(
      field('receiver', $._expr),
      '.',
      field('method', $.identifier),
      optional(seq('[', commaSep1($._type), ']')),
      '(',
      commaSep($.call_arg),
      ')',
    )),

    call_arg: $ => choice($.named_arg, $._expr),
    named_arg: $ => seq(
      field('name', $.identifier),
      '=',
      field('value', $._expr),
    ),

    field_expr: $ => prec.left(15, seq(
      field('object', $._expr),
      '.',
      field('field', $.identifier),
    )),

    index_expr: $ => prec.left(15, seq(
      field('object', $._expr),
      '[',
      field('index', commaSep1($._expr)),
      ']',
    )),

    slice_expr: $ => prec.left(15, seq(
      field('object', $._expr),
      '[',
      optional(field('start', $._expr)),
      ':',
      optional(field('end', $._expr)),
      optional(seq(':', optional(field('step', $._expr)))),
      ']',
    )),

    cast_expr: $ => prec.left(15, seq(
      field('value', $._expr),
      'as',
      field('type', $._type),
    )),

    try_expr: $ => prec.left(15, seq(
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

    // Parser::parse_primary accepts a trailing comma in an array literal.
    array_lit: $ => seq('[', commaSepTrailing($._expr), ']'),

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

    // Ranges sit immediately above assignment and below logical-or in the
    // compiler (`parse_assignment -> parse_range -> parse_logical_or`).
    range_expr: $ => prec.left(2, seq(
      field('start', $._expr),
      choice('..', '..='),
      field('end', $._expr),
    )),

    paren_expr: $ => seq('(', $._expr, ')'),

    // ── Terminals ─────────────────────────────────────────────────────────────

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,
    // Decimal or `0x` hexadecimal integers, matching the compiler lexer.
    integer_literal: $ => token(choice(/0[xX][0-9a-fA-F]+/, /[0-9]+/)),
    // A fraction, an exponent, or both: 3.14, 6.022e23, 1.5e-10, 2E+3.
    float_literal: $ => token(choice(
      /[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?/,
      /[0-9]+[eE][+-]?[0-9]+/,
    )),
    // Every quoted literal is a format string (D-020): `{expr[:spec]}`
    // interpolates, `{}`/`{:spec}` are format-call placeholders, `{{`/`}}`
    // are literal braces. Raw strings stay opaque.
    string_literal: $ => seq(
      '"',
      repeat(choice(
        $.string_content,
        $.escape_sequence,
        $.brace_escape,
        $.interpolation,
        $.format_placeholder,
      )),
      token.immediate('"'),
    ),
    string_content: $ => token.immediate(prec(1, /[^"\\{}]+/)),
    escape_sequence: $ => token.immediate(/\\(u\{[0-9a-fA-F]+\}|[\s\S])/),
    brace_escape: $ => token.immediate(choice('{{', '}}')),
    interpolation: $ => seq(
      token.immediate('{'),
      field('value', $._expr),
      optional(seq(':', field('spec', $.format_spec))),
      '}',
    ),
    format_placeholder: $ => seq(
      token.immediate('{'),
      optional(seq(':', field('spec', $.format_spec))),
      '}',
    ),
    format_spec: $ => token.immediate(/[^}]+/),
    byte_string_literal: $ => choice(
      /b"([^"\\]|\\.)*"/,
      /br"[^"]*"/,
    ),
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

function commaSepTrailing(rule) {
  return seq(commaSep(rule), optional(','));
}

// The compiler permits either delimiter between aggregate fields and enum
// variants. Keep this distinct from expression lists, where only commas are
// valid, so editors recover the same declaration syntax as the compiler.
function itemSep(rule) {
  return optional(seq(rule, repeat(seq(choice(',', ';'), rule)), optional(choice(',', ';'))));
}
