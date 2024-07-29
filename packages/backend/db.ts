import { generateKeyPairSync } from 'crypto'
import bcrypt from 'bcrypt'
import { environment } from './environment'
import { logger } from './utils/logger'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Sequelize } = require('sequelize')
import { Model, InferAttributes, InferCreationAttributes, DataTypes } from 'sequelize'

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('sequelize-hierarchy-fork')(Sequelize)

const sequelize = new Sequelize(environment.databaseConnectionString, {
  logging: (sql: any, time: number) => {
    if (environment.logSQLQueries) {
      logger.trace({ duration: time, query: sql })
    } else if (time > 2500) {
      logger.warn({ duration: time, query: sql })
    }
  },
  dialectOptions: {
    connectTimeout: 10000
  },
  pool: {
    max: 6,
    min: 2,
    acquire: 30000,
    idle: 5000
  },
  retry: {
    max: environment.prod ? 3 : 0,
    backoffBase: 100, // Initial backoff duration in ms. Default: 100,
    backoffExponent: 1.1 // Exponent to increase backoff each try. Default: 1.1
  },
  benchmark: true
})

const FederatedHost = sequelize.define(
  'federatedHosts',
  {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
      primaryKey: true
    },
    displayName: Sequelize.TEXT,
    publicInbox: Sequelize.TEXT,
    publicKey: Sequelize.TEXT,
    detail: Sequelize.STRING,
    blocked: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    friendServer: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    }
  },
  {
    indexes: [
      {
        unique: false,
        fields: ['blocked']
      },
      {
        unique: true, // fucking hell mysql
        fields: [
          {
            attribute: 'displayName',
            type: 'FULLTEXT'
          }
        ]
      }
    ]
  }
)

const User = sequelize.define(
  'users',
  {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
      primaryKey: true
    },
    email: {
      type: Sequelize.STRING(768),
      allowNull: true
      //unique: true
    },
    description: Sequelize.TEXT,
    descriptionToLower: Sequelize.TEXT,
    name: Sequelize.TEXT,
    nameToLower: Sequelize.TEXT,
    url: Sequelize.TEXT,
    urlToLower: Sequelize.TEXT,
    NSFW: Sequelize.BOOLEAN,
    avatar: Sequelize.TEXT,
    password: Sequelize.TEXT,
    birthDate: Sequelize.DATE,
    activated: Sequelize.BOOLEAN,
    // we see the date that the user asked for a password reset. Valid for 2 hours
    requestedPasswordReset: Sequelize.DATE,
    // we use activationCode for activating the account & for reset the password
    // could generate some mistakes but consider worth it
    activationCode: Sequelize.STRING,
    registerIp: Sequelize.STRING,
    lastLoginIp: Sequelize.STRING,
    lastTimeNotificationsCheck: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: new Date()
    },
    privateKey: Sequelize.TEXT,
    publicKey: Sequelize.TEXT,
    federatedHostId: {
      type: Sequelize.UUID,
      allowNull: true,
      primaryKey: false
    },
    remoteInbox: Sequelize.TEXT,
    remoteId: Sequelize.TEXT,
    remoteMentionUrl: Sequelize.TEXT,
    isBot: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    banned: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    role: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    manuallyAcceptsFollows: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    headerImage: Sequelize.TEXT,
    followersCollectionUrl: Sequelize.TEXT,
    followingCollectionUrl: Sequelize.TEXT,
    followerCount: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    followingCount: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    disableEmailNotifications: {
      type: Sequelize.BOOLEAN,
      defaultValue: 0
    }
  },
  {
    indexes: [
      {
        unique: true,
        fields: [
          {
            attribute: 'remoteId'
          }
        ],
        type: 'FULLTEXT'
      },
      {
        unique: false,
        fields: [
          {
            attribute: 'remoteInbox'
          }
        ],
        type: 'FULLTEXT'
      },
      {
        unique: false,
        fields: ['banned']
      },
      {
        unique: false,
        fields: ['activated']
      },
      {
        unique: true,
        fields: [
          {
            attribute: 'url'
          }
        ],
        type: 'FULLTEXT'
      },
      {
        unique: true,
        fields: [
          {
            attribute: 'urlToLower',
            length: 768
          }
        ]
      },
      {
        unique: true,
        fields: [
          {
            attribute: 'email'
          }
        ],
        type: 'FULLTEXT'
      }
    ]
  }
)

User.addHook('beforeSave', 'userToLower', (user: any, options: any) => {
  user.descriptionToLower = user.description ? user.description.toLowerCase() : ''
  user.nameToLower = user.name.toLowerCase()
  user.urlToLower = user.url.toLowerCase()
})

const UserOptions = sequelize.define(
  'userOptions',
  {
    userId: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
      primaryKey: true
    },
    optionName: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true
    },
    optionValue: Sequelize.TEXT
  },
  {
    indexes: [
      {
        unique: true,
        fields: ['userId', 'optionName']
      }
    ]
  }
)

const Quotes = sequelize.define('quotes', {})

const Follows = sequelize.define(
  'follows',
  {
    remoteFollowId: Sequelize.TEXT,
    accepted: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    }
  },
  {
    indexes: [
      {
        unique: false,
        fields: ['followerId']
      },
      {
        unique: false,
        fields: ['followedId']
      },
      {
        unique: true,
        fields: ['followedId', 'followerId']
      },
      {
        unique: false,
        fields: ['followedId', 'accepted']
      }
    ]
  }
)

const Blocks = sequelize.define(
  'blocks',
  {
    remoteBlockId: Sequelize.TEXT,
    reason: Sequelize.TEXT
  },
  {
    indexes: [
      {
        unique: false,
        fields: ['blockerId']
      },
      {
        unique: false,
        fields: ['blockedId']
      },
      {
        unique: true,
        fields: ['blockedId', 'blockerId']
      }
    ]
  }
)

const Mutes = sequelize.define('mutes', {
  reason: Sequelize.TEXT
})

const ServerBlock = sequelize.define('serverBlocks', {})

const Post = sequelize.define(
  'posts',
  {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
      primaryKey: true
    },
    content_warning: Sequelize.TEXT,
    content: Sequelize.TEXT('medium'), // 16mb of data is more than enough
    remotePostId: Sequelize.TEXT,
    privacy: Sequelize.INTEGER,
    featured: {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false
    }
  },
  {
    indexes: [
      {
        //unique: true,
        fields: [
          {
            attribute: 'remotePostId',
            type: 'FULLTEXT'
          }
        ]
      },
      {
        unique: false,
        fields: ['parentId']
      },
      {
        unique: false,
        fields: ['userId']
      },
      {
        unique: false,
        fields: ['createdAt']
      },
      {
        unique: false,
        fields: ['createdAt', 'userId']
      },
      {
        unique: false,
        fields: ['featured']
      }
    ]
  }
)
const SilencedPost = sequelize.define('silencedPost', {})
const PostTag = sequelize.define(
  'postTags',
  {
    tagName: Sequelize.TEXT,
    tagToLower: Sequelize.TEXT
  },
  {
    indexes: [
      {
        fields: [
          {
            attribute: 'tagToLower',
            length: 768
          }
        ]
      },
      {
        fields: ['postId']
      }
    ]
  }
)

PostTag.addHook('beforeSave', 'tagToLower', (postTag: any, options: any) => {
  postTag.tagToLower = postTag.tagName.toLowerCase()
})

const Emoji = sequelize.define(
  'emojis',
  {
    id: {
      type: Sequelize.STRING,
      allowNull: false,
      primaryKey: true
    },
    name: Sequelize.STRING,
    url: Sequelize.TEXT,
    external: Sequelize.BOOLEAN
  },
  {
    indexes: [
      {
        unique: false,
        fields: [
          {
            attribute: 'name'
          },
          {
            attribute: 'external'
          }
        ]
      }
    ]
  }
)

const EmojiReaction = sequelize.define(
  'emojiReaction',
  {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
      primaryKey: true
    },
    remoteId: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    content: Sequelize.TEXT
  },
  {
    indexes: [
      {
        unique: true,
        fields: [
          {
            attribute: 'remoteId',
            type: 'FULLTEXT'
          }
        ]
      }
    ]
  }
)

const EmojiCollection = sequelize.define('emojiCollections', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    allowNull: false,
    primaryKey: true
  },
  name: Sequelize.STRING,
  comment: {
    allowNull: true,
    type: Sequelize.TEXT
  }
})

const Media = sequelize.define('medias', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    allowNull: false,
    primaryKey: true
  },
  order: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  },
  NSFW: Sequelize.BOOLEAN,
  description: Sequelize.TEXT,
  url: Sequelize.TEXT,
  ipUpload: Sequelize.STRING,
  external: {
    defaultValue: false,
    type: Sequelize.BOOLEAN,
    allowNull: false
  }
})

const PostReport = sequelize.define('postReports', {
  resolved: Sequelize.BOOLEAN,
  severity: Sequelize.INTEGER,
  description: Sequelize.TEXT
})

const UserReport = sequelize.define('userReports', {
  resolved: Sequelize.BOOLEAN,
  severity: Sequelize.INTEGER,
  description: Sequelize.TEXT
})

const UserEmojiRelation = sequelize.define('userEmojiRelations', {})

const PostEmojiRelations = sequelize.define('postEmojiRelations', {})

const PostMediaRelations = sequelize.define('postMediaRelations', {})

const PostMentionsUserRelation = sequelize.define(
  'postMentionsUserRelations',
  {},
  {
    indexes: [
      {
        // unique: true,
        fields: [
          {
            attribute: 'postId'
          }
        ]
      },
      {
        unique: false,
        fields: ['userId']
      }
    ]
  }
)

//PostMentionsUserRelation.removeAttribute('id')

const UserLikesPostRelations = sequelize.define(
  'userLikesPostRelations',
  {
    userId: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'users',
        key: 'id'
      },
      unique: false
    },
    postId: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'posts',
        key: 'id'
      },
      unique: false
    },
    remoteId: {
      type: Sequelize.TEXT,
      allowNull: true
    }
  },
  {
    indexes: [
      {
        fields: [
          {
            attribute: 'postId'
          }
        ]
      },
      {
        unique: true,
        fields: [
          {
            attribute: 'remoteId',
            type: 'FULLTEXT'
          }
        ]
      }
    ]
  }
)

const QuestionPoll = sequelize.define('questionPoll', {
  endDate: Sequelize.DATE,
  multiChoice: Sequelize.BOOLEAN
})

const QuestionPollQuestion = sequelize.define('questionPollQuestion', {
  questionText: Sequelize.TEXT,
  index: Sequelize.INTEGER,
  remoteReplies: Sequelize.INTEGER
})

const QuestionPollAnswer = sequelize.define('questionPollAnswer', {
  remoteId: Sequelize.TEXT
})

const PostHostView = sequelize.define('postHostView', {})

const RemoteUserPostView = sequelize.define('remoteUserPostView', {})

Post.hasOne(QuestionPoll)
QuestionPoll.belongsTo(Post)
QuestionPoll.hasMany(QuestionPollQuestion, { onDelete: 'cascade' })
QuestionPollQuestion.belongsTo(QuestionPoll)
QuestionPollQuestion.hasMany(QuestionPollAnswer, { onDelete: 'cascade' })
QuestionPollAnswer.belongsTo(User)
QuestionPollAnswer.belongsTo(QuestionPollQuestion)

Post.hasMany(EmojiReaction)
EmojiReaction.belongsTo(Post)
User.hasMany(EmojiReaction)
EmojiReaction.belongsTo(User)
EmojiReaction.belongsTo(Emoji)

User.hasMany(UserOptions)
UserOptions.belongsTo(User)

User.hasMany(QuestionPollAnswer),
  User.belongsToMany(Emoji, {
    through: UserEmojiRelation
  })
User.belongsToMany(User, {
  through: Follows,
  as: 'followed',
  foreignKey: 'followerId'
})

Post.belongsToMany(Emoji, {
  through: PostEmojiRelations
})
Emoji.belongsToMany(Post, {
  through: PostEmojiRelations
})
Emoji.belongsTo(EmojiCollection)
EmojiCollection.hasMany(Emoji)
Emoji.belongsToMany(User, {
  through: UserEmojiRelation
})
User.belongsToMany(User, {
  through: Follows,
  as: 'follower',
  foreignKey: 'followedId'
})

Follows.belongsTo(User, {
  as: 'follower',
  foreignKey: 'followedId'
})

Follows.belongsTo(User, {
  as: 'followed',
  foreignKey: 'followerId'
})

User.belongsToMany(User, {
  through: Blocks,
  as: 'blocker',
  foreignKey: 'blockedId'
})

User.belongsToMany(User, {
  through: Blocks,
  as: 'blocked',
  foreignKey: 'blockerId'
})

Blocks.belongsTo(User, {
  as: 'blocker',
  foreignKey: 'blockerId'
})

Blocks.belongsTo(User, {
  as: 'blocked',
  foreignKey: 'blockedId'
})

User.belongsToMany(User, {
  through: Mutes,
  as: 'muter',
  foreignKey: 'mutedId'
})

User.belongsToMany(User, {
  through: Mutes,
  as: 'muted',
  foreignKey: 'muterId'
})

Mutes.belongsTo(User, {
  as: 'muter',
  foreignKey: 'muterId'
})

Mutes.belongsTo(User, {
  as: 'muted',
  foreignKey: 'mutedId'
})

ServerBlock.belongsTo(User, {
  as: 'userBlocker'
})
ServerBlock.belongsTo(FederatedHost, {
  as: 'blockedServer'
})

Post.belongsToMany(Post, {
  through: Quotes,
  as: 'quoted',
  foreignKey: 'quoterPostId'
})

Post.belongsToMany(Post, {
  through: Quotes,
  as: 'quoter',
  foreignKey: 'quotedPostId'
})

PostReport.belongsTo(User)
PostReport.belongsTo(Post)
Post.hasMany(PostReport)
User.hasMany(PostReport)
User.hasMany(SilencedPost, { as: 'silencedPost' })
Post.hasMany(SilencedPost, { as: 'silencedBy' }), SilencedPost.belongsTo(User)
SilencedPost.belongsTo(Post)
Post.hasMany(PostTag)
PostTag.belongsTo(Post)

UserReport.belongsTo(User, { foreignKey: 'ReporterId' })
UserReport.belongsTo(User, { foreignKey: 'ReportedId' })

User.belongsTo(FederatedHost, { foreignKey: 'federatedHostId' })
FederatedHost.hasMany(User)
User.hasMany(Post)
Post.belongsTo(User, {
  as: 'user'
})
Post.isHierarchy()
Media.belongsTo(User)
Media.belongsToMany(Post, {
  through: PostMediaRelations
})
Post.belongsToMany(Media, {
  through: PostMediaRelations
})

// mentions
User.belongsToMany(Post, {
  through: PostMentionsUserRelation,
  as: 'mentioner',
  foreignKey: 'userId'
})

Post.belongsToMany(User, {
  through: PostMentionsUserRelation,
  as: 'mentionPost',
  foreignKey: 'postId'
})

UserLikesPostRelations.belongsTo(User)
UserLikesPostRelations.belongsTo(Post)
User.hasMany(UserLikesPostRelations)
Post.hasMany(UserLikesPostRelations)

FederatedHost.belongsToMany(Post, {
  through: PostHostView,
  as: 'postView'
})
Post.belongsToMany(FederatedHost, {
  through: PostHostView,
  as: 'hostView'
})

Post.belongsToMany(User, {
  through: RemoteUserPostView,
  as: 'view'
})
User.belongsToMany(Post, {
  through: RemoteUserPostView,
  as: 'postView'
})

sequelize
  .sync({
    force: environment.forceSync
  })
  .then(async () => {
    if (environment.forceSync) {
      logger.info('CLEANING DATA. Creating admin and deleted user')
      const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      })

      const admin = {
        email: environment.adminEmail,
        description: 'Admin',
        url: environment.adminUser,
        name: environment.adminUser,
        NSFW: false,
        password: await bcrypt.hash(environment.adminPassword as string, environment.saltRounds),
        birthDate: new Date(),
        avatar: '',
        role: 10,
        activated: true,
        registerIp: '127.0.0.1',
        lastLoginIp: '127.0.0.1',
        banned: false,
        activationCode: '',
        privateKey,
        publicKey
      }

      const deleted = {
        email: 'localhost@localhost',
        description: 'DELETED USER',
        url: environment.deletedUser,
        name: environment.deletedUser,
        NSFW: false,
        password: await bcrypt.hash('deleted', environment.saltRounds),
        birthDate: new Date(),
        avatar: '',
        role: 0,
        activated: true,
        registerIp: '127.0.0.1',
        lastLoginIp: '127.0.0.1',
        banned: true,
        activationCode: '',
        privateKey,
        publicKey
      }

      const adminUser = await User.create(admin)
      const del = await User.create(deleted)
    }
  })

export {
  sequelize,
  User,
  UserOptions,
  Blocks,
  Mutes,
  Post,
  PostReport,
  UserReport,
  PostTag,
  Follows,
  Media,
  Emoji,
  EmojiCollection,
  PostMentionsUserRelation,
  UserLikesPostRelations,
  FederatedHost,
  ServerBlock,
  SilencedPost,
  QuestionPoll,
  QuestionPollAnswer,
  QuestionPollQuestion,
  EmojiReaction,
  UserEmojiRelation,
  PostEmojiRelations,
  PostMediaRelations,
  Quotes,
  PostHostView,
  RemoteUserPostView
}
