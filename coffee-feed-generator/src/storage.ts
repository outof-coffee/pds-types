import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import * as path from 'path'

// Types
export type CoffeeBeanPost = {
  $type: string
  uri: string
  cid: string
  createdAt: string
  text: string
  beanName?: string
  origin?: string
  roastLevel?: string
  brewMethod?: string
  rating?: number
  location?: { lat: string; lng: string }
}

type DatabaseData = {
  posts: CoffeeBeanPost[]
}

// Storage API class
export class PostStorage {
  private db: Low<DatabaseData>

  constructor(dbPath: string) {
    const adapter = new JSONFile<DatabaseData>(dbPath)
    this.db = new Low(adapter, { posts: [] })
  }

  async initialize(): Promise<void> {
    await this.db.read()
    await this.purgeOldPosts()
  }

  // Purge posts older than 18 hours
  private async purgeOldPosts(): Promise<void> {
    const eighteenHoursAgo = new Date()
    eighteenHoursAgo.setHours(eighteenHoursAgo.getHours() - 18)
    
    const initialCount = this.db.data.posts.length
    this.db.data.posts = this.db.data.posts.filter(post => {
      const postDate = new Date(post.createdAt)
      return postDate >= eighteenHoursAgo
    })
    
    const purgedCount = initialCount - this.db.data.posts.length
    if (purgedCount > 0) {
      await this.db.write()
      console.log(`Purged ${purgedCount} posts older than 18 hours`)
    }
  }

  // Add post only if URI doesn't already exist
  async addPost(post: CoffeeBeanPost): Promise<boolean> {
    const existingPost = this.db.data.posts.find(p => p.uri === post.uri)
    
    if (existingPost) {
      console.log(`Post with URI ${post.uri} already exists, skipping`)
      return false
    }

    this.db.data.posts.push(post)
    await this.db.write()
    console.log(`Added new post: ${post.uri}`)
    return true
  }

  // Get all posts
  getPosts(): CoffeeBeanPost[] {
    return this.db.data.posts
  }

  // Get post by URI
  getPostByUri(uri: string): CoffeeBeanPost | undefined {
    return this.db.data.posts.find(p => p.uri === uri)
  }

  // Get posts count
  getPostCount(): number {
    return this.db.data.posts.length
  }

  // Clear all posts (for testing)
  async clearPosts(): Promise<void> {
    this.db.data.posts = []
    await this.db.write()
  }
}
