const ITCH_URL = "https://itch.io/my-feed";

const XML_STRING = `<!--?xml version="1.0" encoding="UTF-8"?-->`;

function makeAnEntry(id, time, author, authoruri, link, title, summary){
    return `<entry><id>tag:itch.io,2021:${id}</id>
    <updated>${time}</updated>
    <author>
      <name>${author}</name>
      <uri>${authoruri}</uri>
    </author>
    <link rel="alternate" type="text/html" href="${link}"></link>
    <title>${title}</title>
    <summary type="html"><![CDATA[${summary}]]></summary>
    </entry>`;
}

function removeXMLChars(input){
    return input.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;");
}

function processOnePost(data){
    return makeAnEntry(
        "post" + data.id, // an incrementing number in the form 00000000
        data.attributes.published_at, // e.g. 2021-05-04T14:27:09.000+00:00
        removeXMLChars(author.attributes.full_name), // Text
        author.attributes.url, // https://whatever.itch.io
        data.attributes.url, // "https://itch.io/events/000000"
        removeXMLChars(data.attributes.title), //  text
        generateSummary(data, included) // HTML
    );
}

function downloadPage(xml){
    const textfile = new File([xml], "itchio.atom", {type: "text/atom"});
    chrome.downloads.download({
        url: window.URL.createObjectURL(textfile),
        filename: "itchio.atom",
        conflictAction: "overwrite",
        saveAs: false
    });
    // download was started. does not mean it completed.
    const today = new Date().getDay();
    chrome.storage.local.set({"lastrun": today});
}

function cleanHTML(raw){
    // relative URLs break the feed generation
    return raw.replaceAll(`="/`, `="https://itch.io/`).replaceAll(`url("&quot;/`, `url(&quot;https://itch.io)`);
}

function makeSummary(meta2, meta3, preview, raw){
    return `<h1>${meta2.innerText} ${meta3.innerText}</h1>` +
    (preview ? preview.outerHTML : ``)
    + `<br />
    ` + raw.innerHTML.replaceAll(`<span class="star icon-star"></span>`,`⭐`);
}

function extractEventsArray(body){
    const div = document.createElement("div");
    div.innerHTML = body;
    const events = Array.from(div.querySelectorAll(".event_row"));
    return events.map(event => {
        const meta1 = event.querySelector(".event_header .event_user_action .event_time"); // <a href="/event/6558640" title="2021-05-13 17:43:49" data-label="event_permlink" class="event_time">1 day ago</a>
        const meta2 = event.querySelector(".event_header .event_user_action .event_source_user"); // <a href="https://cavesrd.itch.io" data-label="event_user" class="event_source_user">caves rd</a>
        const meta3 = event.querySelector(".event_header .event_user_action strong"); // <strong>updated a beta</strong>
        const preview = event.querySelector(".game_thumb"); // <div style="background-color:#9e9aef;" class="game_thumb"><a class="thumb_link game_link" data-label="game:1684116:thumb" tabindex="-1" data-action="game_grid" href="https://brianna-lei.itch.io/butterfly-soup-2"><img data-lazy_src="https://img.itch.zone/aW1nLzEwMzkxODE4LnBuZw==/315x250%23c/X2RMfG.png" class="lazy_loaded" height="250" width="315" src="https://img.itch.zone/aW1nLzEwMzkxODE4LnBuZw==/315x250%23c/X2RMfG.png"></a><div class="game_cell_tools"><a href="/g/brianna-lei/butterfly-soup-2/add-to-collection?source=event" class="action_btn add_to_collection_btn"><span class="icon icon-playlist_add"></span>Add to collection</a></div></div>
        const sumry = event.querySelector(".event_main_content"); // html
        return {
            id: "event"+meta1.href.match(/\d+/)[0],
            time: meta1.title.replaceAll(" ", "T")+".000+00:00",
            authorid: meta2.href,
            author: removeXMLChars(meta2.innerText),
            url: meta1.href,
            title: removeXMLChars(meta2.innerText) + " " + removeXMLChars(meta3.innerText),
            content: makeSummary(meta2, meta3, preview, sumry) // HTML
        };
    });
}

function createInMemoryPage(data){
    const head = XML_STRING +`
    <feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
        <id>tag:itch.io,2021:feed/itch.io</id>
        <title>Itch.io Atom User Feed</title>
        <icon>https://itch.io/favicon.ico</icon>
        <subtitle>Your itch.io subscriptions as an Atom feed</subtitle>
        <logo>https://itch.io/static/images/itchio-square-144.png</logo>`;
    let body = `<updated>`+new Date().toISOString()+`</updated>`;
    data.forEach(post => {
        body += "\n" + makeAnEntry(post.id, post.time, post.author, post.authorid, post.url, post.title, post.content);
    });
    const tail = `</feed>`;
    return head + body + tail;
}

function workInBackground(){
    chrome.storage.local.get({"lastrun": 99999999}, details => {
        const lastrun = details["lastrun"];
        const today = new Date().getDay();
        console.log("Running. Last: " + lastrun + " today: " + today);
        // don't run if it already ran today
        if(today !== lastrun) {
            fetch(ITCH_URL)
            .then(response => response.blob())
            .then(blob => blob.text())
            .then(cleanHTML)
            .then(extractEventsArray)
            .then(createInMemoryPage)
            .then(downloadPage);
        } else {
            // an alarm? I'm assuming i don't keep my browser opne all the time...
        }
    });
}

// else running in background page
chrome.runtime.onStartup.addListener(workInBackground);
chrome.runtime.onInstalled.addListener(workInBackground);
