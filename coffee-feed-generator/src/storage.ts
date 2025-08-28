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
