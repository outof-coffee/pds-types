import { Lexicons } from '@atproto/lexicon'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import { URL } from 'url'
import { PostStorage, CoffeeBeanPost } from './storage'
import { FirehoseClient } from './firehose'
import { handleTimelineFeed } from './timeline'

type FeedItem = {
  post: string // AT URI
}

// Read the coffee bean post lexicon from the parent directory
const lexiconPath = path.join(__dirname, '../../lexicons/coffee/outof/beanPost.json')
const beanPostLexicon = JSON.parse(fs.readFileSync(lexiconPath, 'utf8'))

console.log('Coffee Bean Post Lexicon loaded:')
console.log('ID:', beanPostLexicon.id)
console.log('Description:', beanPostLexicon.description)

// Initialize lexicons
const lexicons = new Lexicons([beanPostLexicon])

console.log('Lexicons initialized successfully!')
console.log('Available lexicons:', Array.from(lexicons).map(doc => doc.id))

// Functional feed generation pipeline
const isCoffeeBeanPost = (record: any): boolean => 
  record?.$type === 'coffee.outof.beanPost'

// Simple TID (Timestamp Identifier) generation for AT Protocol
// TIDs are base32-encoded microsecond timestamps
const generateTid = (): string => {
  const now = Date.now() * 1000 // Convert to microseconds
  return now.toString(32).padStart(13, '0') // base32, padded to consistent length
}

const filterCoffeePosts = (posts: any[]): CoffeeBeanPost[] =>
  posts.filter(isCoffeeBeanPost)

const sortByCreatedAt = (posts: CoffeeBeanPost[]): CoffeeBeanPost[] =>
  [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

const limitFeedSize = (limit: number) => (posts: CoffeeBeanPost[]): CoffeeBeanPost[] =>
  posts.slice(0, limit)

const formatFeedItems = (posts: CoffeeBeanPost[]): FeedItem[] =>
  posts.map(post => ({ post: post.uri }))

// Main feed generation function - compose the pipeline
const generateCoffeeFeed = (allPosts: any[], limit: number = 50): FeedItem[] => {
  const pipeline = [
    filterCoffeePosts,
    sortByCreatedAt,
    limitFeedSize(limit),
    formatFeedItems
  ]
  
  return pipeline.reduce((data, fn) => fn(data), allPosts)
}

// HTTP server for AT Protocol feed skeleton endpoint
const createServer = (storage: PostStorage) => {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`)
    
    // CORS headers for AT Protocol clients
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    // AT Protocol timeline feed endpoint (authenticated)
    if (url.pathname === '/xrpc/app.bsky.feed.getTimeline' && req.method === 'GET') {
      await handleTimelineFeed(req, res, storage, url)
      return
    }

    // AT Protocol feed skeleton endpoint (public)
    if (url.pathname === '/xrpc/app.bsky.feed.getFeedSkeleton' && req.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
      const cursor = url.searchParams.get('cursor')
      
      // Generate feed skeleton with only coffee bean posts
      const feedItems = generateCoffeeFeed(storage.getPosts(), limit)
      
      const response = {
        feed: feedItems,
        cursor: feedItems.length > 0 ? feedItems[feedItems.length - 1].post : undefined
      }
      
      res.writeHead(200)
      res.end(JSON.stringify(response))
      return
    }

    // Feed generator description endpoint
    if (url.pathname === '/xrpc/app.bsky.feed.describeFeedGenerator' && req.method === 'GET') {
      const response = {
        did: process.env.FEEDGEN_DID || 'did:web:localhost:3580',
        feeds: [
          {
            uri: `at://${process.env.FEEDGEN_DID || 'did:web:localhost:3580'}/app.bsky.feed.generator/coffee-feed`,
            displayName: 'Coffee Bean Posts',
            description: 'Fresh coffee posts from around the network - discover new beans, brewing methods, and coffee experiences'
          },
          {
            uri: `at://${process.env.FEEDGEN_DID || 'did:web:localhost:3580'}/app.bsky.feed.generator/coffee-timeline`,
            displayName: 'Coffee Timeline', 
            description: 'Personalized timeline of coffee posts from people you follow'
          }
        ]
      }
      
      res.writeHead(200)
      res.end(JSON.stringify(response))
      return
    }

    // Health check endpoint
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200)
      res.end(JSON.stringify({ status: 'ok', posts: storage.getPostCount() }))
      return
    }

    // 404 for other routes
    res.writeHead(404)
    res.end(JSON.stringify({ error: 'Not found' }))
  })
}

// Initialize and run everything
async function main() {
  // Initialize storage
  const dbFile = path.join(__dirname, '../data/posts.json')
  const storage = new PostStorage(dbFile)
  await storage.initialize()

  console.log('Database initialized. Current posts:', storage.getPostCount())

  // Test with stored data
  console.log('Testing feed generation with stored data:')
  const testFeed = generateCoffeeFeed(storage.getPosts())
  console.log('Generated feed items:', testFeed.length)

  // Start HTTP server
  const server = createServer(storage)
  const port = process.env.PORT || 3580
  
  // Start firehose client
  const firehose = new FirehoseClient(storage, lexicons)
  firehose.start()
  
  server.listen(port, () => {
    console.log(`Feed generator server running on port ${port}`)
    console.log(`Public feed endpoint: http://localhost:${port}/xrpc/app.bsky.feed.getFeedSkeleton`)
    console.log(`Timeline feed endpoint: http://localhost:${port}/xrpc/app.bsky.feed.getTimeline`)
    console.log(`Feed generator description: http://localhost:${port}/xrpc/app.bsky.feed.describeFeedGenerator`)
    console.log(`Health check: http://localhost:${port}/health`)
  })
}

main().catch(console.error)
