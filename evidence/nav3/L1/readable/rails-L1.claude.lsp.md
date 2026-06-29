# transcript: I'm trying to reason about how Rails holds a single attribute's value in memory before it ever touches the database — the object that represents one named at...


💬 Let me load the LSP tool and find the `ActiveModel::Attribute` class.
  ▸ ToolSearch(select:LSP)
  ▸ LSP(ActiveModel::Attribute)
  ▸ Bash(find /home/bench/repos/rails/activemodel/lib -name "attribute.rb" | head -20)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/rails/activemodel/lib/active_model/attribute.rb","line":1,"character":1})

💬 Now let me read the full file.
  ▸ Read(/home/bench/repos/rails/activemodel/lib/active_model/attribute.rb)

💬 Now let me also check the type base class interface to understand the type-object side.
  ▸ LSP(ActiveModel::Type::Value)
  ▸ LSP({"operation":"documentSymbol","filePath":"/home/bench/repos/rails/activemodel/lib/active_model/type/value.rb","line":1,"character":1})
  ▸ Read(/home/bench/repos/rails/activemodel/lib/active_model/type/value.rb)

💬 Here is the complete picture.  ---  ## `ActiveModel::Attribute` — the single-attribute container  File: `activemodel/lib/active_model/attribute.rb`  ---  ###...

──────── RESULT (success, 95122ms, 9 turns) ────────
Here is the complete picture.

---

## `ActiveModel::Attribute` — the single-attribute container

File: `activemodel/lib/active_model/attribute.rb`

---

### The five instance variables

```
@name                  # the attribute's string name, e.g. "age"
@value_before_type_cast  # the raw input, preserved exactly as it arrived
@type                  # a Type::Value instance — the conversion authority
@original_attribute    # the prior Attribute object, or nil (change anchor)
@value                 # the memoized cast result — lazily populated
```

**`@value_before_type_cast`** is the immutable record of what actually arrived — a raw DB string `"42"`, a user-submitted form string, whatever. It never changes after construction. Exposed by `attr_reader :value_before_type_cast` (line 29).

**`@value`** is the cast result and is populated lazily (line 43):

```ruby
def value
  @value = type_cast(value_before_type_cast) unless defined?(@value)
  @value
end
```

It uses `defined?` rather than `||=` because `@value` might legitimately be `false` or `nil` after casting, and `||=` would re-cast on every read in that case. `has_been_read?` (line 111) checks `defined?(@value)` for the same reason.

**`@type`** holds a `Type::Value` instance. That type object defines the entire conversion vocabulary: `deserialize` (database input → Ruby), `cast` (user input → Ruby), `serialize` (Ruby → database), `changed?` (compare two already-cast values), and `changed_in_place?` (detect in-place mutation of a mutable object like an array). The attribute itself has no conversion logic; it just delegates through `@type`.

**`@original_attribute`** is either `nil` (this attribute was loaded from the database and not yet reassigned) or a reference to the `Attribute` that existed before a user assignment. It is the change-detection anchor. The private alias `assigned?` (line 153) truths-tests it. `original_value` (line 47) follows the chain recursively until it reaches an unassigned node, giving you the value as it stood at load time.

---

### Origin is encoded by subclass, not a flag

The class is never instantiated directly. Three private subclasses implement the one abstract method, `type_cast`, to record where the value came from:

| Factory | Subclass | `type_cast` calls | Meaning |
|---|---|---|---|
| `Attribute.from_database(…)` | `FromDatabase` | `type.deserialize(value)` | DB result set — raw bytes/strings |
| `Attribute.from_user(…)` | `FromUser` | `type.cast(value)` | Setter call or form param |
| `Attribute.with_cast_value(…)` | `WithCastValue` | identity (returns value as-is) | Already-cast default |

`FromDatabase#_original_value_for_database` (line 192–193) short-circuits to `value_before_type_cast` directly — the raw DB string *is* the original serialized form, so no serialize round-trip is needed. `FromUser#_value_for_database` (line 207) calls `Type::SerializeCastValue.serialize`, which avoids re-casting an already-cast value on the way back out.

`FromUser#came_from_user?` (line 202) returns true unless the type reports the value was constructed by mass-assignment, giving the system a way to distinguish deliberate explicit assignment from bulk-loaded data.

---

### How change detection flows through `@original_attribute`

When a user calls `model.age = 30`, Rails calls `with_value_from_user(30)` on the existing attribute (line 78–81):

```ruby
def with_value_from_user(value)
  type.assert_valid_value(value)
  self.class.from_user(name, value, type, original_attribute || self)
end
```

The third argument — `original_attribute || self` — captures the current attribute as the anchor. The new `FromUser` attribute is returned; the old one is stored at `@original_attribute` inside it.

`changed?` (line 66) then has two paths:

1. **`changed_from_assignment?`** (line 161): `assigned?` is true, so it asks the type: `type.changed?(original_value, value, value_before_type_cast)`. The default comparison is `old != new` on the cast values.
2. **`changed_in_place?`** (line 70): even without an assignment, a mutable object (e.g. a Hash or Array) may have been mutated after loading. It calls `type.changed_in_place?(original_value_for_database, value)`, comparing the raw serialized original against the current cast value. The type knows whether its values are mutable; `Type::Value#changed_in_place?` returns `false` by default and is overridden only for types that produce mutable Ruby objects.

`original_value_for_database` (line 143–149) recursively delegates down `original_attribute` until it hits an unassigned node, which for a `FromDatabase` attribute returns `value_before_type_cast` directly — the raw string that came out of the database row.

---

### The shape in summary

```
FromDatabase attribute (loaded from DB row)
  @name                    = "age"
  @value_before_type_cast  = "42"          # raw DB string
  @type                    = Integer type object
  @original_attribute      = nil           # no prior assignment
  @value                   = (unset until first read, then 42)

  → user calls model.age = 30 →

FromUser attribute (user assignment)
  @name                    = "age"
  @value_before_type_cast  = 30            # exactly what the user passed
  @type                    = (same Integer type object)
  @original_attribute      = ↑ FromDatabase attribute above
  @value                   = (unset until first read, then 30)
```

`changed?` returns `true` because `original_value` (42, cast from the DB attribute) `!=` `value` (30). If the user had written `model.age = 42`, the type's `changed?` would return `false` and the attribute would not be considered dirty.
