# What this app does, and who does it

Folio is the desk for Damascus University’s journals. An author sends a paper to one journal. Editors send it to reviewers. A copyeditor prepares the accepted text. Readers then find it in the public catalog.

You only see the menu items for roles on your account. One person can hold more than one role. Log in as one sample account at a time until the path below is familiar.

Arabic and English are both first-class. The interface flips to right-to-left in Arabic.

## The path of a paper

1. **Author** writes a draft, chooses the journal, then one section of that journal. Both choices are required. The journal page starts the form with that journal already chosen.
2. On submit, the paper is assigned. If the section has section editors, every one of them is assigned. Otherwise the journal's editor-in-chief is assigned when that seat is filled. Otherwise the journal's manager is assigned when that seat is filled. Otherwise the paper stays unassigned. There is no later reassignment screen.
3. Whoever is assigned invites **reviewers**. The editor-in-chief and the journal manager of that journal can do the same on any paper in the journal, including a paper already assigned to a section editor.
4. Each **reviewer** accepts or declines, reads the review copy, and sends a recommendation. A reviewer belongs to one journal (or more, if given each membership) and sees a paper only after an invitation.
5. A section editor with “can record the decision” records the decision. One without that flag writes a recommendation and does not change the status. The editor-in-chief and the journal manager record the decision by role.
6. After acceptance, a **copyeditor** works with the author, then publishes.
7. **Readers** open it under Publications. No account is required.

Workflow mail goes only to the people assigned at submit. A section editor sees only papers assigned to them. The editor-in-chief sees every paper in their journal. The journal manager sees the queue of the journals they manage.

## Roles and screens

| Role | Menu | What you do there |
|------|------|-------------------|
| Reader | Publications, Journals | Browse journals, issues, and published papers. Download the public file. |
| Author | Submissions | Start a paper, fill in the title and abstracts, upload files or write it in the app, submit, then answer revision and copyedit requests. |
| Editor-in-chief | Editor | Every submitted paper in the journal you are chief of. Invite reviewers, record the decision, and send an accepted paper to copyediting. Edit that journal’s ISSN and aims and scope. One chief per journal. |
| Section editor | Section editor | Papers assigned to you, which are the ones submitted to a section you are linked to. Invite reviewers. Record the decision only when that link says you can; otherwise write a recommendation. One person may be linked to several sections. |
| Reviewer | My reviews | Accept or decline an invitation for a journal you belong to. Read the review files. Send comments and a recommendation. Set whether you are available and how many reviews you will take at once. |
| Copyeditor | Copyediting | After acceptance: send questions to the author, wait for their revised file, publish when the text is ready. |
| Journal manager | Users, Journal settings, Email, Audit log | The journals where you hold the manager seat. Create that journal’s sections and link section editors. Set the chief, section editors, and reviewers of those journals. Edit that journal’s registered title. Invite reviewers and record decisions on its papers. Email templates, reminder policy, and the audit log stay one copy for the whole site, so every journal manager still sees them. |

Journal settings is also on the editor-in-chief menu, limited to their own journal. Only the manager of a journal changes that journal’s registered title. A manager does not edit titles of journals they do not manage.

Search curation (under the journal-manager menu for editors) is optional catalog tuning. Skip it until the path above is clear.

## What you can ignore at first

These exist, and they are off unless the machine running the app turned them on:

- Suggestions while writing: discipline, keywords, similar papers, suggested reviewers.
- Grammar and reference checks on the copyeditor’s screen.
- Catalog search beyond ordinary keywords.

The paper still moves through the seven steps without any of that.

## Try it on a local copy

Open the app, sign in as one row, and use only that row’s menu. Passwords are for the seeded development database.

| Sign in as | Password | You are |
|------------|----------|---------|
| `author@folio.dev` | `Author123!` | Author |
| `editor@folio.dev` | `Editor123!` | Editor-in-chief of the economics journal |
| `section.econj@folio.dev` | `Section123!` | Section editor of that same journal |
| `reviewer@folio.dev` | `Reviewer123!` | Reviewer of the economics journal only |
| `copyeditor@folio.local` | `Copyeditor123!` | Copyeditor |
| `manager@folio.local` | `Manager123!` | Journal manager of the economics journal |

Other journals use `manager.<slug>@folio.dev` with the same manager password. `reviewer2@folio.dev` is the law journal’s reviewer. `reviewer3@folio.dev` belongs to no journal and cannot be invited.

The other eight journals have the same pattern: `editor.lawj@folio.dev`, `section.medj@folio.dev`, and so on, with the passwords in the table. Sample papers are titled with `[SAMPLE]`.

A new registration becomes an author. Reviewer, copyeditor, section editor, and editor-in-chief are given by the journal manager. Editor-in-chief and section editor also have to accept an invitation, then be placed on a journal from Users.
