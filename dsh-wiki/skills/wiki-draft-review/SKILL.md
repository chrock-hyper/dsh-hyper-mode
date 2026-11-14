---
name: wiki-draft-review
description: Use when a wiki page should be created or changed with the `wiki` tool — write the draft, then hand review to the human in the Wiki panel. Also use when a draft was rejected and you need to read the reason and revise.
whenToUse: The task involves writing project or global knowledge into the wiki, or the user asks about a draft waiting for review.
---

# Wiki draft review

The wiki is a convention-first set of Markdown files. Two independent stores
exist: a global one under `$DSH_HOME/wiki/` and a project one under
`<projectRoot>/.dsh/wiki/`. Each may also have a human-maintained contract file,
`wiki.md`, next to the `wiki/` directory. Read a store's contract before you
write to it: it is the human's statement of what belongs there.

## You cannot write a page

Approval is human-only, on purpose. Your write path is a draft:

1. Read what exists: `wiki` with `action: "read"` for the page you are about to
   change, `action: "search"` or `action: "list"` when you do not know the id.
   Page ids are relative paths such as `guide/setup.md`, and relative Markdown
   links (`[term](./guide/term.md)`) are how pages point at each other.
2. Draft the write: `wiki` with `action: "draft"`, `path`, and `content`. Pass
   a bare Markdown body; put the title, tags, and status in the `title`, `tags`,
   and `status` parameters. The tool records the draft under `drafts/` and
   returns `{ draftPath, base, created|replaced }`.
3. Tell the human what to review, in one or two sentences: which page, what
   changed, and that the Wiki panel has it waiting. Do not repeat the draft, and
   do not write the page file yourself.

A draft records the sha1 of the page body it was based on (`base`, or `new` for
a page that does not exist yet). If the page changes before approval, the panel
refuses the approval as a conflict; a re-draft is usually right, and forcing is
the human's decision.

## Check your own drafts

`wiki` with `action: "status"` lists the drafts authored under your name. A
rejected draft stays on disk with a reason in its `draft:` block. When one is
rejected:

1. Read the reason from the `status` result.
2. Read the current page again — it may have moved on.
3. Write a fresh draft. The new draft replaces the rejected one, so mention the
   reason it now addresses when you hand it back for review.

Approval and rejection delete or rewrite the draft; you do not need to clean up.

## Do not

- Do not edit files under `wiki/` or `wiki/drafts/` directly, and do not run git
  in those directories.
- Do not claim a page was published. Only the approval in the panel publishes
  it; before then it is a draft.
