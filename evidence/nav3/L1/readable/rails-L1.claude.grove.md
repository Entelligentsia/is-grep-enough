# transcript: I'm trying to reason about how Rails holds a single attribute's value in memory before it ever touches the database — the object that represents one named at...


💬 Let me load the grove tools and then map out the attribute container structure.
  ▸ ToolSearch(select:mcp__grove__symbols,mcp__grove__source,mcp__grove__outline,mcp__grove__map)
  ▸ mcp__grove__map({"dir":"activemodel/lib/active_model/attribute"})
  ▸ mcp__grove__outline({"file":"activemodel/lib/active_model/attribute.rb"})

💬 Now let me read the core sections of `attribute.rb` in full.
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#initialize@33"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#from_database@8"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#from_user@12"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#with_cast_value@16"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#value@41"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#changed?@66"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#changed_in_place?@70"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#changed_from_assignment?@161"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#original_value@47"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#with_value_from_user@78"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#with_type@91"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#type_cast@174"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#type_cast@198"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#type_cast@213"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#forgetting_assignment@178"})
  ▸ mcp__grove__source({"id":"ruby:activemodel/lib/active_model/attribute.rb#initialize_dup@155"})

💬 Now I have the full picture. Here is a thorough walkthrough.  ---  ## `ActiveModel::Attribute` — the single-attribute container  The class lives at `activemo...

──────── RESULT (success, 68181ms, 20 turns) ────────
Now I have the full picture. Here is a thorough walkthrough.

---

## `ActiveModel::Attribute` — the single-attribute container

The class lives at `activemodel/lib/active_model/attribute.rb`. Every named attribute on a model is represented by one instance of this class (or one of its inner subclasses). The record itself holds a hash of these objects, one per attribute name.

---

### The five slots on every instance

```ruby
# line 33–39
def initialize(name, value_before_type_cast, type, original_attribute = nil, value = nil)
  @name                  = name
  @value_before_type_cast = value_before_type_cast
  @type                  = type
  @original_attribute    = original_attribute
  @value = value unless value.nil?
end
```

**`@name`** — the attribute's string name (`"title"`, `"created_at"`, etc.). It is structural identity: a key used when hashing and comparing attributes.

**`@value_before_type_cast`** — the raw value exactly as it arrived, before any conversion. This is what `record.title_before_type_cast` returns. It is stored and never mutated. When a value comes from the database it is whatever the adapter pulled off the wire (often a String); when it comes from a user assignment it is whatever Ruby object the caller passed in. The distinction between those two cases is encoded by the subclass, not by this slot.

**`@type`** — a reference to the type object (an `ActiveModel::Type::Value` subclass, e.g. `ActiveModel::Type::String`, `ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Uuid`, etc.). The type object is the sole place responsible for conversion logic. The attribute container itself contains no conversion code; it delegates entirely:

- `FromDatabase#type_cast` → `type.deserialize(value)` — wire format → Ruby object
- `FromUser#type_cast` → `type.cast(value)` — user input → Ruby object
- `WithCastValue#type_cast` → identity (value is already cast, no conversion needed)

**`@original_attribute`** — another `Attribute` instance, or `nil`. This is the provenance pointer. It is `nil` when the attribute has never been assigned a new value (it is "clean"). The moment you write `record.title = "new"`, a fresh `FromUser` attribute is built, and its `@original_attribute` is set to the attribute that was there before the assignment. This single pointer is what makes the "did this change?" question answerable without storing a separate copy of the old value.

**`@value`** — the memoized cast value, populated lazily on first read. Note `unless value.nil?`: the initializer accepts a pre-computed cast value (used by the `from_database` factory when the adapter already knows the deserialized form), but otherwise the slot starts unset and is filled the first time `#value` is called:

```ruby
# line 41–45
def value
  @value = type_cast(value_before_type_cast) unless defined?(@value)
  @value
end
```

`defined?` is used instead of `||=` deliberately — because a legitimately cast value of `nil` or `false` must not re-trigger casting on every access.

---

### How the raw/cast split works

There are always exactly two representations of the value in memory:

1. **`@value_before_type_cast`** — the raw form, set once at construction, immutable.
2. **`@value`** — the cast form, computed from `@value_before_type_cast` via `@type`, lazily and cached.

You can always get back to the raw form (`value_before_type_cast`) without any type knowledge. You only ever touch the type when you need the cast form, and even then only once.

---

### How provenance is encoded — the subclass hierarchy

The class uses inheritance, not a flag field, to remember where a value came from:

```
Attribute (abstract base)
├── FromDatabase    — value came from a database row
├── FromUser        — value came from a Ruby assignment
├── WithCastValue   — value is already in cast form (used for defaults computed in Ruby)
├── Null            — attribute exists in schema but has no value yet
└── Uninitialized   — attribute is not yet part of the schema at all
```

`came_from_user?` is `false` on the base and overridden to `true` only in `FromUser` (line 202). This is the hook dirty-tracking and serialization use to decide whether to trust a value or re-serialize it.

---

### How change detection works

`changed?` combines two checks:

```ruby
def changed?
  changed_from_assignment? || changed_in_place?
end
```

**`changed_from_assignment?`** (line 161) — follows the `@original_attribute` chain:

```ruby
def changed_from_assignment?
  assigned? && type.changed?(original_value, value, value_before_type_cast)
end
```

`assigned?` is aliased to `original_attribute` — it is truthy if and only if `@original_attribute` is set, meaning this is a new attribute born from a user write. `original_value` walks back up the chain (`original_attribute.original_value`) until it finds an unassigned ancestor, which returns `type_cast(value_before_type_cast)` — the cast form of the oldest known value. The type object's `changed?` then compares old cast value against new cast value (with the raw value available as a third argument to help types that need it).

**`changed_in_place?`** (line 70) covers mutable objects (like a serialized Hash or a binary blob) that were never reassigned but whose content was mutated through the Ruby object:

```ruby
def changed_in_place?
  has_been_read? && type.changed_in_place?(original_value_for_database, value)
end
```

`has_been_read?` guards against deserializing purely to check for mutation — if `@value` was never materialized, it cannot have been mutated in place. `original_value_for_database` re-serializes the oldest known value so the type can compare two database-side representations.

---

### Producing a new attribute from a new value

Mutations do not modify the existing object. Instead they return a new `Attribute`:

```ruby
def with_value_from_user(value)
  type.assert_valid_value(value)
  self.class.from_user(name, value, type, original_attribute || self)
end
```

The new object carries the same `@name` and `@type`, has the incoming value as its `@value_before_type_cast`, and — critically — passes `original_attribute || self` as the provenance pointer. If the current attribute was already a user-assigned one, its own parent is forwarded; if it was clean, `self` becomes the parent. This keeps the chain at depth 1 regardless of how many times the attribute is written.

---

### Summary of what the container stores

| Slot | What it holds | Why |
|---|---|---|
| `@name` | attribute name string | identity and keying |
| `@value_before_type_cast` | raw value as received | preserved for introspection, dirty tracking, re-serialization |
| `@type` | type object | owns all conversion: `cast`, `deserialize`, `serialize`, `changed?` |
| `@original_attribute` | previous `Attribute` or `nil` | provenance; the presence of this pointer means "was assigned" |
| `@value` | lazily memoized cast result | avoids re-casting on every read |

The subclass (`FromDatabase` vs `FromUser` vs `WithCastValue`) encodes where the value came from by overriding `type_cast` to call the right method on `@type` — `deserialize` for database values, `cast` for user values, identity for already-cast values. Everything else — change detection, serialization, `dup` safety — flows from these five slots and that subclass distinction.
