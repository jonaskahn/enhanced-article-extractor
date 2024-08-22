// utils -> parseFromHtml

import { pipe, stripTags, truncate, unique } from 'bellajs'

import { cleanify, imagify, mediatify, purify, socialify } from './html.js'

import {
  absolutify as absolutifyUrl,
  chooseBestUrl,
  getDomain,
  isValid as isValidUrl,
  normalize as normalizeUrls,
  purify as purifyUrl
} from './linker.js'

import extractMetaData from './extractMetaData.js'

import extractWithReadability, { extractTitleWithReadability } from './extractWithReadability.js'

import { execBodyParser, execPostParser, execPreParser } from './transformation.js'

import getTimeToRead from './getTimeToRead.js'

const summarize = (desc, txt, threshold, maxlen) => { // eslint-disable-line
  return desc.length > threshold
    ? desc
    : truncate(txt, maxlen).replace(/\n/g, ' ')
}

export default async (inputHtml, inputUrl = '', parserOptions = {}) => {
  const pureHtml = purify(inputHtml)
  const meta = extractMetaData(pureHtml)

  let title = meta.title

  const {
    url,
    shortlink,
    amphtml,
    canonical,
    description: metaDesc,
    image: metaImg,
    author,
    published,
    favicon: metaFav,
    type,
  } = meta

  const {
    wordsPerMinute = 300,
    descriptionTruncateLen = 210,
    descriptionLengthThreshold = 180,
    contentLengthThreshold = 200,
  } = parserOptions

  // gather title
  if (!title) {
    title = extractTitleWithReadability(pureHtml, inputUrl)
  }
  if (!title) {
    return null
  }

  // gather urls to choose the best url later
  const links = unique(
    [url, shortlink, amphtml, canonical, inputUrl].filter(isValidUrl).map(purifyUrl)
  )

  if (!links.length) {
    return null
  }

  // choose the best url, which one looks like title the most
  const bestUrl = chooseBestUrl(links, title)

  const refinedContentChain = pipe(
    (input) => {
      return normalizeUrls(input, bestUrl)
    },
    (input) => {
      return execPreParser(input, links)
    },
    (input) => {
      return extractWithReadability(input, bestUrl)
    },
    (input) => {
      return input ? execPostParser(input, links) : null
    },
    (input) => {
      return input ? cleanify(input) : null
    }
  )

  const content = refinedContentChain(inputHtml)

  if (!content) {
    return null
  }

  const textContent = stripTags(content)
  if (textContent.length < contentLengthThreshold) {
    return null
  }

  const description = summarize(
    metaDesc,
    textContent,
    descriptionLengthThreshold,
    descriptionTruncateLen
  )

  const refinedBodyHtml = pipe(
    (input) => {
      return normalizeUrls(input, bestUrl)
    },
    (input) => {
      return execBodyParser(input, links)
    },
    (input) => {
      return input ? execPostParser(input, links) : null
    },
    (input) => {
      return input ? cleanify(input) : null
    }
  )

  const refinedReadableContent = pipe(
    (input) => {
      return normalizeUrls(input, bestUrl)
    },
    (input) => {
      return execPreParser(input, links)
    },
    (input) => {
      return extractWithReadability(input, bestUrl)
    },
    (input) => {
      return input ? execPostParser(input, links) : null
    }
  )

  return {
    url: bestUrl,
    source: getDomain(bestUrl),
    meta: {
      title: title,
      description: description,
      links: links,
      cover: metaImg ? absolutifyUrl(bestUrl, metaImg) : '',
      favicon: metaFav ? absolutifyUrl(bestUrl, metaFav) : '',
      author: author,
      published: published,
    },
    images: imagify(content),
    social: socialify(refinedBodyHtml(inputHtml)),
    media: mediatify(refinedBodyHtml(inputHtml)),
    content: textContent,
    readableContent: refinedReadableContent(inputHtml),
    rawContent: content,
    ttr: getTimeToRead(textContent, wordsPerMinute),
    type,
  }
}
