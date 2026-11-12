"""Rebrands the VectorCraft web build (run on the cloned source before `trunk build`).

Only visible names, links and icons are changed. Licence notices stay: the About box and the
README keep the VectorCraft MIT OR Apache-2.0 attribution. Every patch is best effort: a patch that
no longer matches a newer VectorCraft version is reported and skipped, it never stops the build.
"""
import re
import shutil
import sys
from pathlib import Path

vc = Path(sys.argv[1]).resolve()
here = Path(__file__).resolve().parent.parent / "branding"
NAME = "Smart Pre-Press"


def patch(rel, fn, what):
    p = vc / rel
    if not p.exists():
        print(f"SKIP {rel}: not found ({what})")
        return
    s = p.read_text(encoding="utf-8")
    n = fn(s)
    if n == s:
        print(f"SKIP {rel}: nothing changed ({what})")
    else:
        p.write_text(n, encoding="utf-8")
        print(f"OK   {rel}: {what}")


def rename_strings(s):
    # VectorCraft -> Smart Pre-Press inside "..." literals only (never identifiers or crate names)
    return re.sub(r'"[^"\n]*"', lambda m: m.group(0).replace("VectorCraft", NAME), s)


# 1. About box: keep the licence attribution, say what this is
def about(s):
    return s.replace(
        "Part of ArtCraft. MIT OR Apache-2.0. Fonts: Source Sans 3, Inter, JetBrains Mono (OFL). Icons: Lucide (ISC) + VectorCraft.",
        "Smart Pre-Press vector editor, based on the open-source VectorCraft (MIT OR Apache-2.0). Fonts: Source Sans 3, Inter, JetBrains Mono (OFL). Icons: Lucide (ISC).",
    )


patch("crates/ui-egui/src/dialogs/about.rs", about, "About text")

# 2. no Discord / ArtCraft / GitHub links
def community(s):
    s = re.sub(r"(fn links_in\([^)]*\) \{).*?\n\}\n", r"\1\n    let _ = (app, ui, centered);\n}\n", s, count=1, flags=re.S)
    s = s.replace("discord_layout(ui, large).2", "{ let _ = (ui, large); 0.0 }", 1)
    s = re.sub(
        r"(pub fn discord_button\([^)]*\) -> egui::Response \{)",
        r"\1\n    let _ = (&app, large);\n    if true {\n        return ui.allocate_response(vec2(0.0, 0.0), Sense::hover());\n    }",
        s,
        count=1,
    )
    return s


patch("crates/ui-egui/src/community.rs", community, "no community links or Discord button")


def menus(s):
    s = s.replace(', c("Join Our Discord", "help.discord")', "")
    s = re.sub(r'^[ \t]*c\("(Join Our Discord|ArtCraft Website|VectorCraft on getartcraft\.com|VectorCraft on GitHub)", "[^"]+"\),\n', "", s, flags=re.M)
    return s


patch("crates/ui-egui/src/menus/tree.rs", menus, "Help menu without ArtCraft / Discord / GitHub links")


def home(s):
    s = re.sub(
        r'    ui\.add_space\(28\.0\);\n    ui\.vertical_centered\(\|ui\| \{\n        ui\.label\(egui::RichText::new\(tl!\("Community"\)\).*?\n    \}\);\n',
        "",
        s,
        count=1,
        flags=re.S,
    )
    return s


patch("crates/ui-egui/src/canvas/home.rs", home, "Home screen without the Community block")

# 3. visible name in the user interface (string literals of the UI crate and the web page)
skip = ("tests", "dialogs/about.rs")
for f in sorted((vc / "crates/ui-egui/src").rglob("*.rs")):
    rel = f.relative_to(vc).as_posix()
    if any(k in rel for k in skip):
        continue
    s = f.read_text(encoding="utf-8")
    n = rename_strings(s)
    if n != s:
        f.write_text(n, encoding="utf-8")
        print(f"OK   {rel}: name")

patch("crates/engine/src/cmd/help.rs", lambda s: s.replace('"VectorCraft on GitHub"', '"Smart Pre-Press"').replace('"VectorCraft on getartcraft.com"', '"Smart Pre-Press"'), "help labels")
patch("apps/vectorcraft-web/index.html", lambda s: s.replace("<title>VectorCraft</title>", f"<title>{NAME}</title>").replace('content="VectorCraft"', f'content="{NAME}"').replace("Loading VectorCraft", f"Loading {NAME}"), "page title")

# 4. icons: every size of the app icon, the web favicon and the Windows icon
icons = vc / "assets/app-icon"
for d in sorted((icons / "hicolor").glob("*x*")):
    size = int(d.name.split("x")[0])
    src = here / f"icon-{size}.png"
    dst = d / "apps/ai.storyteller.vectorcraft.png"
    if src.exists() and dst.exists():
        shutil.copyfile(src, dst)
        print(f"OK   icon {size}")
for name, src in (("vectorcraft-macos-512.png", "icon-512.png"), ("vectorcraft-1024.png", "icon-512.png"), ("vectorcraft.ico", "icon.ico")):
    if (icons / name).exists():
        shutil.copyfile(here / src, icons / name)
for rel in ("hicolor/scalable/apps/ai.storyteller.vectorcraft.svg", "vectorcraft.svg", "vectorcraft-small.svg"):
    if (icons / rel).exists():
        shutil.copyfile(here / "icon.svg", icons / rel)
print("done")
