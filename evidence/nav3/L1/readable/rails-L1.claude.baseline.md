# transcript: I'm trying to reason about how Rails holds a single attribute's value in memory before it ever touches the database — the object that represents one named at...


💬 Let me locate the core attribute container class directly.
  ▸ Bash(find /home/bench/repos/rails/activemodel/lib -name "attribute.rb" | head -5)
  ▸ Bash(find /home/bench/repos/rails/activerecord/lib -name "attribute.rb" | head -5)
  ▸ Read(/home/bench/repos/rails/activemodel/lib/active_model/attribute.rb)

💬 Here is the complete picture of `ActiveModel::Attribute`, the container in question (`activemodel/lib/active_model/attribute.rb`).  ---  ## The four instance...

──────── RESULT (success, 46413ms, 4 turns) ────────
Here is the complete picture of `ActiveModel::Attribute`, the container in question (`activemodel/lib/active_model/attribute.rb`).

---

## The four instance variables

```ruby
def initialize(name, value_before_type_cast, type, original_attribute = nil, value = nil)
  @name                  = name
  @value_before_type_cast = value_before_type_cast
  @type                  = type
  @original_attribute    = original_attribute
  @value = value unless value.nil?      # only set if a pre-cast value is supplied
end
```

**`@name`** — the attribute name string, e.g. `"published_at"`.

**`@value_before_type_cast`** — the raw value exactly as it arrived, never touched. For a database row this is the wire string `"2024-01-15"`. For a user assignment it is whatever the controller passed in. This is what `attribute_before_type_cast` exposes on the model.

**`@type`** — the type object (an `ActiveModel::Type::Value` subclass, e.g. `ActiveModel::Type::DateTime`). It owns the three conversion operations: `deserialize` (DB wire → Ruby), `cast` (user input → Ruby), and `serialize` (Ruby → DB wire). The attribute itself does none of that math — it delegates entirely to this object.

**`@original_attribute`** — another `Attribute` instance, or `nil`. This is the provenance pointer. It is `nil` when the value came directly from the database and has never been user-assigned. The moment you call `with_value_from_user`, a brand-new `FromUser` attribute is built and the *current* attribute is handed in as `original_attribute`. That creates a one-link chain recording where the value stood before the assignment.

**`@value`** — the lazily memoised cast value. It starts absent (`defined?(@value)` is false) and is computed on first access.

---

## Lazy casting and the `defined?` trick

```ruby
def value
  @value = type_cast(value_before_type_cast) unless defined?(@value)
  @value
end
```

The guard is `defined?` rather than `||=` because the cast result could legitimately be `nil` or `false`. Using `||=` would re-cast on every read for those values; `defined?` fires only when the ivar has never been written at all (line 43).

`type_cast` is abstract on the base class and the subclasses override it:

| Subclass | `type_cast` call | meaning |
|---|---|---|
| `FromDatabase` | `type.deserialize(value)` | DB wire string → Ruby object |
| `FromUser` | `type.cast(value)` | arbitrary user input → Ruby object |
| `WithCastValue` | identity — returns value unchanged | value is already a Ruby object |

---

## The provenance chain and change detection

`changed?` is the entry point (line 66–68):

```ruby
def changed?
  changed_from_assignment? || changed_in_place?
end
```

**`changed_from_assignment?`** (line 161–163): asks whether `@original_attribute` exists (the private alias `assigned?`) and, if so, whether the type considers the value different from what it was:

```ruby
def changed_from_assignment?
  assigned? && type.changed?(original_value, value, value_before_type_cast)
end
```

**`original_value`** (lines 47–53): walks the `original_attribute` chain recursively until it reaches a node with no `original_attribute` (i.e. the root, the database-sourced value), then type-casts that:

```ruby
def original_value
  if assigned?
    original_attribute.original_value   # recurse up the chain
  else
    type_cast(value_before_type_cast)   # root: cast the DB wire value
  end
end
```

So the chain is always at most one link long in normal use — the database attribute is the root, the current user-assigned attribute points back to it — but the recursive design allows deeper chains if needed.

**`changed_in_place?`** (lines 70–72) handles mutable objects (like a Hash stored in a JSON column) that were modified without a new assignment. It compares the serialized form of the *current* `@value` against the serialized form of the original value, but only if `@value` has ever been read at all (`has_been_read?`). Without that guard it would deserialize unnecessarily on every dirty-check pass.

---

## The factory methods and what `original_attribute` encodes

```ruby
# Value came from a DB row — no assignment history yet
Attribute.from_database("title", "Hello", string_type)
# => FromDatabase.new("title", "Hello", string_type, original_attribute: nil)

# User assigned a new value — previous attribute becomes the provenance link
existing_attr.with_value_from_user("World")
# => FromUser.new("title", "World", string_type, original_attribute: existing_attr)
```

`original_attribute` being `nil` is the signal that the attribute has never been user-assigned, so `changed_from_assignment?` short-circuits immediately for pristine, unmodified attributes — no type comparison needed.

`forgetting_assignment` (line 74–76) resets provenance by discarding `original_attribute` and rewriting the attribute as if the current value had come straight from the database, which is what happens after a successful `save`.

---

## Summary of structure

```
ActiveModel::Attribute
  @name                   — attribute name string
  @value_before_type_cast — raw input, preserved forever
  @type                   — type object, owns deserialize/cast/serialize
  @original_attribute     — nil (never assigned) or pointer to predecessor
  @value                  — lazily computed via type_cast, may be absent
```

The subclass chosen at construction time (`FromDatabase` vs `FromUser` vs `WithCastValue`) determines *which* type method is used to compute `@value` — that is the only behavioral difference between them. Everything else — the provenance chain, dirty-checking, serialization — lives on the base class and works the same regardless of origin.
