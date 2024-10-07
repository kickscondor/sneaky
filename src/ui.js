import 'regenerator-runtime/runtime'
import 'normalize.css'
import './ui.css'
const bonion = require('bonion')
const matter = require('gray-matter')
const rangy = require('rangy')
const strftime = require('strftime')
const u = require('umbrellajs')

const autolinkRe = /\[([^\]]+)\](?!\()/g;
const defaultPage = "---\nsummary: A new wiki page.\n---\nOpen the editor to work on this page."

function ready(fn) {
  if (document.readyState !== 'loading') {
    return fn()
  }
  u(document).on('DOMContentLoaded', fn)
}  

function replaceTmpl(str, title) {
  str = str.replace(/\bTITLE\b/, title)
  str = str.replace(/\b(MM|DD|YY|YYYY)+\b/g, df => {
    let nf = "", matches = df.matchAll(/MM|DD|YY|YYYY/g)
    for (const match of matches) {
      switch (match[0]) {
        case "MM": nf += "%m"; break;
        case "DD": nf += "%d"; break;
        case "YY": nf += "%y"; break;
        case "YYYY": nf += "%Y"; break;
      }
    }
    return nf
  })
  return strftime(str, new Date())
}

// function replaceFn(match) {
//   switch (match.getType()) {
//     case 'url':
//       let trunc = match.getUrl().replace(/:\/\/(\w{6})\w{56}(\w{2})\//,
//         'hyper://$1..$2/')
//       return `<a href="${match.getUrl()}">${trunc}</a>`
//   }
// }

async function createPage(path, contents = defaultPage) {
  if (path[0] !== '/') {
    path = '/' + path
  }
  let stat = null
  try { stat = await beaker.hyperdrive.stat(path) } catch {}
  if (!stat) {
    if (!path.match(/\.\w*$/)) {
      path += ".md"
    }

    await beaker.hyperdrive.writeFile(path, contents)
  }
  window.location.replace(path)
}

ready(async function () {
  if (window.location.pathname === '/.ui/copy') {
    let blank = await beaker.hyperdrive.forkDrive("hyper://e876a03f2708e7f87accdb3bddfc611eb0891ebb48f17c3e4023e8ad91045fb6/",
      {detached: true})
    window.location.replace(blank.url)
    return
  }

  if (window.location.pathname === '/.ui/create') {
    //
    // Determine whether or not to create this page, ensure a .md extension if none
    //
    let match = window.location.search.match(/^\?path=([^&]+)/)
    if (match) {
      createPage(decodeURIComponent(match[1]))
    }
    return
  }

  let B = await bonion(beaker.hyperdrive.drive())
  //
  // Load balancing (send new users to the least-common fork)
  //
  if (B.isMain()) {
    let fave = localStorage.getItem('favoriteFork')
    if (!fave) {
      if (await B.canWrite()) {
        fave = '*'
      } else {
        let lcf = await B.getLeastCommonFork()
        if (lcf) {
          fave = lcf.drive.url
        }
      }
      if (fave) {
        localStorage.setItem('favoriteFork', fave)
      }
    }

    //
    // Redirect to the selected fork.
    //
    if (fave && fave.includes('://') && !fave.startsWith(window.location.origin)) {
      window.location.replace(fave + window.location.pathname.slice(1) +
        window.location.search + window.location.hash)
    }
  }

  //
  // Wiki page loading
  //
	let paths = [decodeURI(window.location.pathname)]
  let info = await B.getInfo()
  let history = window.location.hash.split('#')
  if (history.length > 1) {
    paths = paths.concat(history.slice(1))
  }

  for (let path of paths) {
    if (path[0] !== '/') {
      path = '/' + path
    }
    let loadpath = path
    if (loadpath.match(/\/$/)) {
      loadpath += "index.md"
    }

    let str, page = null
    try { page = await B.stat(loadpath) } catch {}
    if (page === null) {
      loadpath = path
      try { page = await B.stat(loadpath) } catch {}
    }

    let summary, meta = u('<div class="meta">'), m = loadpath.match(/^\/(.*?)(\/|\.\w*)?$/)

    // Inject the HTML.
    let div = u('<div class="page"></div>')
    let hdr = u('<header>')
    let h1 = u('<span>')
    hdr.append(u('<h1>').append(h1))
    let main = u('<main>')
    main.html('<p style="text-align: center">Loading this page...</p>')
    if (m) {
      h1.text(m[1])
      window.title = m[1]
    }
    div.append(hdr)
    div.append(main)
    u(document.body).append(div)

    if (page === null) {
      summary = u('<div class="summary">').html("This page was not found on the network.")
      str = `<p><a href="/.ui/create?path=${encodeURIComponent(path)}">Create this page</a></p>`
    } else {
      // Query the network for the latest page.
      if (page.stat?.isDirectory()) {
        let files = await B.readdir(loadpath)
        str = u('<ul>')
        for (let file of files) {
          if (!file.name.match(/^(\.|index\.\w+$)/)) {
            let fname = file.name.replace(/\.md$/, '')
            str.append(u('<li>').append(u('<a>').
              attr('href', loadpath + file.name).text(fname)))
          }
        }
      } else {
        let raw = str = await page.drive.readFile(loadpath)
        if (m && m[2] == '.md') {
          let doc = matter(str)
          if (doc.data) {
            if (doc.data.tags) {
              for (let tag of doc.data.tags) {
                meta.append(u('<div class="tag">').text(tag))
              }
            }
            if (doc.data.title) {
              m[1] = doc.data.title
            }
            if (doc.data.summary) {
              summary = u('<div class="summary">').html(doc.data.summary)
            }
            if (doc.data.template) {
              meta.append(u('<a href="#" class="template">').
                text('Create: ' + replaceTmpl(doc.data.template, 'TITLE')).
                on('click', e => {
                  let title = ''
                  if (doc.data.template.match(/\bTITLE\b/)) {
                    title = prompt("Enter the new page title:")
                  }

                  let path = replaceTmpl(doc.data.template, title)
                  delete doc.data.template
                  for (let key in doc.data) {
                    doc.data[key] = replaceTmpl(doc.data[key], title)
                  }
                  doc.content = replaceTmpl(doc.content, title)
                  let contents = matter.stringify(doc)
                  createPage(path, contents)
                })
              )
            }
          }
          str = doc.content

          // Asynchronously build embeds and auto-links.
          let match, idCache = {}
          while ((match = autolinkRe.exec(str)) !== null) {
            let id = match[1]
            if (id in idCache) {
              continue
            }

            let m = id.split('.')
            let mpage = null, val = null
            let fname = `/${m[0]}.md`
            try { mpage = await B.stat(fname) } catch {}
            if (!mpage) {
              fname = `/${m[0]}`
              try { mpage = await B.stat(fname) } catch {}
            }

            if (m.length === 1) {
              if (mpage || id.match(/^[\/\w]+$/)) {
                val = `[${id}](${encodeURI(fname)})`
              }
            } else if (mpage) {
              val = mpage.stat.metadata[m[1]]
              if (!val) {
                let embed = matter(await mpage.drive.readFile(fname))
                val = embed.data[m[1]]
              }
            }

            idCache[id] = val
          }

          // Okay, swap all embed and auto-links into place.
          str = str.replace(autolinkRe, id => idCache[id.slice(1, -1)] || id)
          str = beaker.markdown.toHTML(str)
        }

        if (info.writable && page.drive !== B.drive) {
          let merge = u(`<a href='#' class='merge'><span class='icon'>\u{1F4e5}</span><span>Update from<br>${page.label || 'main'}</span></a>`)
          merge.on('click', e => B.drive.writeFile(loadpath, raw).
            then(() => window.location.reload()))
          h1.after(merge)
        }
      }
    }

    // Inject the updated file details.
    if (m) {
      h1.text(m[1])
      window.title = m[1]
    }
    hdr.prepend(meta)
    if (typeof(str) === 'string') {
      main.html(str)
    } else {
      main.empty().append(str)
    }
    if (summary) {
      main.prepend(summary)
    }

    div.append(u('<footer>').text(page.stat.mtime))
  }
});
