#import "@preview/cetz:0.4.2"
#import cetz.draw: *


#let arrow-style = (
  mark: (end: "stealth", fill: black, scale: 0.8, offset: 0pt),
)
#let gen-name(..args) = {
  args.pos().join(".")
}
#let relation(..args-style, name, attributes, keys: none) = {
  content(..args-style, anchor: "mid-west", raw(name))
  let table-y = -0.7
  let attr-box(..args-style, body, name: none) = {
    content(
      ..args-style,
      name: name,
      anchor: "mid-west",
      {
        set align(center + horizon)
        box(
          stroke: black,
          height: 1.7em,
          inset: (left: 0.8em, right: 0.8em),
          body,
        )
      },
    )
  }
  let attr-name
  let last-attr-name = none
  group(name: name, {
    anchor("root", ())
    for (i, attr) in attributes.enumerate() {
      attr-name = attr
      let attr-content = raw(attr)
      if keys != none {
        if keys.contains(attr) or keys.contains(i) {
          attr-content = underline(attr-content)
        }
      }
      if last-attr-name == none {
        attr-box((rel: (0, table-y)), name: attr-name)[#attr-content]
      } else {
        attr-box(last-attr-name + ".east", name: attr-name)[#attr-content]
      }
      last-attr-name = attr-name
    }
    anchor("base", (rel: (0, 0), to: gen-name(attributes.at(0), "south-west")))
  })
}

#let foreign-key(
  key,
  ref,
  ext-x,
  key-displacement: (0, 0),
  ref-displacement: (0, 0),
) = {
  scope({
    let key-relation = key.split(".").at(0)
    let ref-relation = ref.split(".").at(0)
    set-style(line: (stroke: luma(80%)))
    hide(line((rel: (key-displacement.at(0), 0), to: gen-name(key, "south")), (rel: (0, -2)), name: "key-v"))
    hide(line(
      (rel: (0, -0.15 + key-displacement.at(1)), to: gen-name(key-relation, "base")),
      (rel: (20, 0)),
      name: "key-h",
    ))
    hide(line((rel: (ref-displacement.at(0), 0), to: gen-name(ref, "south")), (rel: (0, -2)), name: "ref-v"))
    hide(line(
      (rel: (0, -0.35 + ref-displacement.at(1)), to: gen-name(ref-relation, "base")),
      (rel: (20, 0)),
      name: "ref-h",
    ))
    hide(line((ext-x, -40), (ext-x, 40), name: "ext-v"))

    set-style(line: (stroke: black))
    let lines = (
      key-relation,
      "key-v",
      "key-h",
      "ext-v",
      "ref-h",
      "ref-v",
      ref-relation,
    )
    let i = 0
    while i < lines.len() - 1 {
      intersections("p" + str(i), lines.at(i), lines.at(i + 1))
      i = i + 1
    }
    let i = 0
    while i < lines.len() - 2 {
      if i == lines.len() - 3 {
        line(gen-name("p" + str(i), "0"), gen-name("p" + str(i + 1), "0"), ..arrow-style)
        break
      }
      line(gen-name("p" + str(i), "0"), gen-name("p" + str(i + 1), "0"))
      i = i + 1
    }
  })
}
