import { Lexicons } from '@atproto/lexicon'
import * as fs from 'fs'
import * as path from 'path'
import { PostStorage, CoffeeBeanPost } from './storage'

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

// Initialize and run everything
async function main() {
  // Initialize storage
  const dbFile = path.join(__dirname, '../data/posts.json')
  const storage = new PostStorage(dbFile)
  await storage.initialize()

  console.log('Database initialized. Current posts:', storage.getPostCount())

  // Add a test post to see the database working
  // Generate a proper TID (timestamp identifier) for AT Protocol
  const tid = generateTid()
  
  const testPost: CoffeeBeanPost = {
    $type: 'coffee.outof.beanPost',
    uri: `at://did:example:alice/coffee.outof.beanPost/${tid}`,
    cid: 'bafytest123',
    createdAt: new Date().toISOString(),
    text: 'Just tried an amazing Ethiopian Yirgacheffe! Bright and floral notes.',
    beanName: 'Ethiopian Yirgacheffe',
    origin: 'Ethiopia',
    roastLevel: 'Light',
    brewMethod: 'Pour Over',
    rating: 9,
    location: { lat: '40.7128', lng: '-74.0060' }
  }

  const wasAdded = await storage.addPost(testPost)
  console.log('Test post result:', wasAdded ? 'Added' : 'Already exists')
  console.log('Total posts:', storage.getPostCount())

  // Test with stored data
  console.log('Testing feed generation with stored data:')
  const testFeed = generateCoffeeFeed(storage.getPosts())
  console.log('Generated feed items:', testFeed.length)
}

main().catch(console.error)
