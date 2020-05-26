import 'regenerator-runtime/runtime'
import 'normalize.css'
import './ui.css'
const matter = require('gray-matter')
const u = require('umbrellajs')
const autolinkRe = /\[([^\s\]]+)\](?!\()/g;

(async function () {
	let paths = [decodeURIComponent(window.location.pathname)]
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

    let str, stat = null
    try { stat = await beaker.hyperdrive.stat(loadpath) } catch {}
    if (stat === null) {
      loadpath = path
      try { stat = await beaker.hyperdrive.stat(loadpath) } catch {}
    }

    let summary, meta = u('<div class="meta">'), m = loadpath.match(/^\/(.*?)(\/|\.\w*)?$/)
    if (stat && stat.isDirectory()) {
      let files = (await beaker.hyperdrive.readdir(loadpath)).sort()
      str = u('<ul>')
      for (let file of files) {
        if (file[0] !== '.' && file !== 'index.json') {
          let fname = file.replace(/\.md$/, '')
          str.append(u('<li>').append(u('<a>').
            attr('href', loadpath + file).text(fname)))
        }
      }
    } else {
      str = await beaker.hyperdrive.readFile(loadpath)
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
          let mstat = null, val = null
          let fname = `/${m[0]}.md`
          try { mstat = await beaker.hyperdrive.stat(fname) } catch {}
          if (!mstat) {
            fname = `/${m[0]}`
            try { mstat = await beaker.hyperdrive.stat(fname) } catch {}
          }

          if (m.length === 1) {
            if (mstat) {
              let title = (mstat.data && mstat.data.title) || id
              val = `[${title}](${fname})`
            }
          } else if (mstat) {
            val = mstat.metadata[m[1]]
            if (!val) {
              let embed = matter(await beaker.hyperdrive.readFile(fname))
              val = embed.data[m[1]]
            }
          }

          idCache[id] = val
        }

        // Okay, swap all embed and auto-links into place.
        str = str.replace(autolinkRe, id => idCache[id.slice(1, -1)] || id)
        str = beaker.markdown.toHTML(str)
      }
    }

    // Inject the HTML.
    let div = u('<div class="page"></div>')
    if (m) {
      let hdr = u('<header>').append(meta)
      hdr.append(u('<h1>').text(m[1]))
      window.title = m[1]
      div.append(hdr)
    }
    let main = u('<main>')
    if (typeof(str) === 'string') {
      main.html(str)
    } else {
      main.append(str)
    }
    if (summary) {
      main.prepend(summary)
    }
    div.append(main)

    div.append(u('<footer>').text(stat.mtime))
    u(document.body).append(div)
  }
})();
