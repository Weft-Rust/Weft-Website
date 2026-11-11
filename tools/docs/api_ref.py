"""Writes docs/reference/*.md from the SDK sources: every public method of every builder type, its
first doc paragraph and a link to the line it is on. Nothing is written by hand there, so a method
added to the SDK shows up on the next run and a method without a doc comment is listed as such.

Run: python api_ref.py PATH_TO_WEFT_CHECKOUT
build.py runs it too, so the site never shows a stale list."""
import re
import sys
from collections import OrderedDict
from pathlib import Path

SDK = OUT = None  # set by main()
BLOB = "https://github.com/Weft-Rust/Weft/blob/master/crates/sdk/src/"

# page -> (title, what the page is). Order is the order in the index.
PAGES = OrderedDict([
    ("blocks", ("Blocks", "The block builder and everything a block's rules, hazards and states are made with.")),
    ("items", ("Items", "The item builder.")),
    ("entities", ("Entities", "Entity kinds, their AI, riding, status effects, poses, game modes and damage causes.")),
    ("worldgen", ("World generation", "Dimensions, biomes, terrain, features, structures and the sky.")),
    ("world", ("World", "What a `World` can do, shapes, directions, conditions.")),
    ("registration", ("Registration", "The registry, components, tags, settings, slots and menus.")),
    ("client", ("Client", "The client side: input, camera, screen text, packets.")),
    ("ui", ("UI", "Screens, HUD parts and the styles they use.")),
    ("recipes", ("Recipes and loot", "Recipe kinds, recipes, loot tables and their pools.")),
    ("events", ("Events and steps", "Events, actions, steps, phases, modifiers and what a callback gets as its argument.")),
    ("effects", ("Particles and effects", "Particles, bursts and what the GPU does with them.")),
    ("commands", ("Commands", "Command definitions and what a command callback gets.")),
    ("other", ("Everything else", "Types that belong to no topic above.")),
])
BY_TYPE = {
    "BlockBuilder": "blocks", "State": "blocks", "Rule": "blocks", "Hazard": "blocks",
    "ItemBuilder": "items",
    "EntityBuilder": "entities", "EntityEffectBuilder": "entities", "EntityModify": "entities",
    "PoseBuilder": "entities", "GameModeBuilder": "entities", "DamageCauseBuilder": "entities",
    "DimensionBuilder": "worldgen", "BiomeBuilder": "worldgen", "SkyBuilder": "worldgen",
    "LiquidBuilder": "blocks",
    "Cond": "world", "Dir": "world",
    "Slots": "registration", "MenuBuilder": "registration",
    "ParticleBuilder": "effects", "Burst": "effects",
    "Registry": "registration", "World": "world", "Handle": "registration", "Id": "registration",
    "Entry": "registration", "Block": "registration", "Item": "registration",
    "EntityKind": "entities", "Hitboxes": "entities", "Projectile": "entities", "Spawn": "entities",
    "SpawnBuilder": "entities", "SpawnPlace": "entities", "Walk": "entities", "Ray": "world",
    "Model": "entities", "ModelPart": "entities", "Looks": "entities", "CategoryBuilder": "entities",
    "Inventory": "registration", "SlotGroup": "registration", "PlayerInventoryBuilder": "registration",
    "RecipeBuilder": "recipes", "RecipeKindBuilder": "recipes", "RecipeView": "recipes",
    "LootBuilder": "recipes", "Pool": "recipes",
    "Dimension": "worldgen", "Gen": "worldgen", "PaletteBuilder": "worldgen",
    "PrecipitationBuilder": "worldgen", "WeatherBuilder": "worldgen", "Template": "worldgen",
    "TemplateBuilder": "worldgen", "ReactionBuilder": "blocks", "Props": "blocks",
    "BlockInfo": "world", "Fill": "world", "EntityFilter": "world", "Facings": "world",
    "Orientation": "world", "Toward": "world",
    "HudElementBuilder": "ui", "MenuCtx": "ui", "WordSetBuilder": "ui",
    "Action": "events", "Ask": "events", "Event": "events", "EventBatch": "events", "BlockEvent": "events",
    "EntityEvent": "events", "EntityTick": "events", "EffectTick": "events", "SystemBatch": "events",
    "StepBuilder": "events", "PhaseBuilder": "events", "Modifier": "events", "Modify": "events",
    "AttributeBuilder": "events", "Damage": "events", "Use": "events", "ItemUse": "events",
    "Place": "events", "Neighbors": "events", "Gate": "events", "GateInputs": "events",
    "SignalEvent": "events",
}
BY_FILE = {
    "ai.rs": "entities", "riding.rs": "entities",
    "feature.rs": "worldgen", "terrain.rs": "worldgen",
    "world.rs": "world", "shape.rs": "world", "shapes.rs": "world", "facing.rs": "world",
    "component.rs": "registration", "config.rs": "registration",
    "client.rs": "client", "camera.rs": "client", "show.rs": "client", "out.rs": "client",
    "ui.rs": "ui", "view.rs": "ui",
    "effects.rs": "effects", "command.rs": "commands",
}


def page_of(file, type_name):
    return BY_TYPE.get(type_name) or BY_FILE.get(file) or "other"


def balanced_skip(text, i):
    depth = 0
    while i < len(text):
        depth += text[i] == "<"
        depth -= text[i] == ">"
        i += 1
        if depth == 0:
            return i
    return i


def impl_type(line):
    m = re.match(r"impl\b\s*", line)
    if not m:
        return None
    i = m.end()
    if line[i:i + 1] == "<":
        i = balanced_skip(line, i)
    rest = line[i:].strip()
    if re.match(r"[\w:<>,&' ]+ for ", rest):
        return "(trait)"
    m = re.match(r"([A-Za-z_][\w:]*)", rest)
    return m.group(1).split("::")[-1] if m else None


def doc_above(lines, i):
    docs = []
    j = i - 1
    while j >= 0 and (lines[j].strip().startswith("#[") or lines[j].strip().startswith("///")):
        t = lines[j].strip()
        if t.startswith("///"):
            docs.append(t[3:].strip())
        j -= 1
    docs.reverse()
    out = []
    for d in docs:
        if not d and out:
            break
        if d:
            out.append(d)
    return " ".join(out)


def clean_sig(text):
    text = " ".join(text.split())
    text = re.sub(r"^pub (const )?fn ", "", text)
    for tail in (" where ", " {", ";"):
        if tail in text:
            text = text[:text.index(tail)]
    text = text.rstrip("{; ")
    text = re.sub(r"\((&mut |&)?mut self, ?", "(", text)
    text = re.sub(r"\((&mut |&)?self, ?", "(", text)
    text = re.sub(r"\((&mut |&)?self\)", "()", text)
    text = text.replace(", )", ")").replace(" -> Self", "")
    return text


def scan():
    pages = {p: OrderedDict() for p in PAGES}
    missing = 0
    total = 0
    for path in sorted(SDK.glob("*.rs")):
        lines = path.read_text(encoding="utf-8").split("\n")
        cur = None
        struct_docs = {}
        for i, line in enumerate(lines):
            m = re.match(r"pub (?:struct|enum|trait) (\w+)", line)
            if m and m.group(1) not in struct_docs:
                struct_docs[m.group(1)] = doc_above(lines, i)
        for i, line in enumerate(lines):
            if line.startswith("impl"):
                cur = impl_type(line)
            elif line == "}":
                cur = None
            m = re.match(r"    pub (?:const )?fn (\w+)", line)
            if not m or not cur or cur == "(trait)":
                continue
            j = i
            parts = [line.strip()]
            while not parts[-1].endswith(("{", ";")) and j + 1 < len(lines) and len(parts) < 40:
                j += 1
                parts.append(lines[j].strip())
            sig = clean_sig(" ".join(parts))
            doc = doc_above(lines, i)
            total += 1
            missing += not doc
            page = pages[page_of(path.name, cur)]
            entry = page.setdefault(cur, {"doc": struct_docs.get(cur, ""), "methods": []})
            if not entry["doc"]:
                entry["doc"] = struct_docs.get(cur, "")
            entry["methods"].append((m.group(1), sig, doc, path.name, i + 1))
    return pages, total, missing


def esc(text):
    return text.replace("|", "\\|")


def write(pages):
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.md"):
        old.unlink()
    index = ["# Reference", "",
             "Every public method of every builder in the SDK, with its summary and a link to where it is defined. "
             "This is generated from the source, so it is complete; the guides explain how the parts fit together.", ""]
    for key, (title, blurb) in PAGES.items():
        types = pages[key]
        if not types:
            continue
        count = sum(len(t["methods"]) for t in types.values())
        index.append(f"- [{title}]({key}.md): {blurb} ({count} methods)")
        out = [f"# {title} reference", "", blurb, ""]
        for name in sorted(types):
            t = types[name]
            out += [f"## {name}", ""]
            if t["doc"]:
                out += [t["doc"], ""]
            for method, sig, doc, file, line in t["methods"]:
                tail = f": {doc}" if doc else ""
                out.append(f'- <a id="{name}-{method}"></a>`.{sig}`{tail} [source]({BLOB}{file}#L{line})')
            out.append("")
        (OUT / f"{key}.md").write_text("\n".join(out), encoding="utf-8", newline="\n")
    (OUT / "index.md").write_text("\n".join(index) + "\n", encoding="utf-8", newline="\n")


def main(repo):
    global SDK, OUT
    repo = Path(repo)
    SDK = repo / "crates" / "sdk" / "src"
    OUT = repo / "docs" / "reference"
    pages, total, missing = scan()
    write(pages)
    print(f"reference: {total} methods, {missing} without a doc comment")
    return pages


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1])
