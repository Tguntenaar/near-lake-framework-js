import { readFile } from "fs/promises";

import { Block } from "../src/types";

import { fromBorsh, borshDeserialize, BorshSchema } from "../src/fromBorsh";

describe("Block", () => {
  it("serializes meta transactions", async () => {
    let streamerMessageBuffer = await readFile(
      `${__dirname}/../../../blocks/105793821.json`
    );
    let streamerMessage = JSON.parse(streamerMessageBuffer.toString());
    let block = Block.fromStreamerMessage(streamerMessage);

    const actions = block.actionByReceiptId(
      "Dpego7SpsK36PyXjUMrFoSze8ZpNsB9xhb3XJJYtXSix"
    );
    expect(actions?.operations[0]).toMatchSnapshot();
  });

  it("parses event logs", async () => {
    let streamerMessageBuffer = await readFile(
      `${__dirname}/../../../blocks/61321189.json`
    );
    let streamerMessage = JSON.parse(streamerMessageBuffer.toString());
    let block = Block.fromStreamerMessage(streamerMessage);

    expect(block.events()).toMatchSnapshot();
  });

  function base64toHex(encodedValue: string) {
    let buff = Buffer.from(encodedValue, "base64");
    return buff.toString("hex");
  }

  it("deserializes using borsch", async () => {
    let streamerMessageBuffer = await readFile(
      `${__dirname}/../../../blocks/114158749.json`
    );
    let streamerMessage = JSON.parse(streamerMessageBuffer.toString());
    let block = Block.fromStreamerMessage(streamerMessage);

    const stateChanges = block.streamerMessage.shards
      .flatMap((e) => e.stateChanges)
      .filter(
        (stateChange) =>
          stateChange.change.accountId === "devgovgigs.near" &&
          stateChange.type === "data_update"
      );

    // Borsh serialize enum as u8 tag + the borsh serialization of the variant. So the posts is the 5th variant (starting from 0th). and it's hex, 5u8 => 0x05
    const enumPositionOfStorageKey = "05";
    const addOrEditPost = stateChanges
      .map((stateChange) => stateChange.change)
      .filter((change) =>
        base64toHex(change.keyBase64).startsWith(enumPositionOfStorageKey)
      )
      .map((c) => ({
        k: Buffer.from(c.keyBase64, "base64"),
        v: Buffer.from(c.valueBase64, "base64"),
      }));

    const authorToPostId = Object.fromEntries(
      addOrEditPost.map((kv) => {
        return [
          kv.v
            .slice(13, 13 + kv.v.slice(9, 13).readUInt32LE())
            .toString("utf-8"),
          Number(kv.k.slice(1).readBigUInt64LE()),
        ];
      })
    );

    const storageKeyEnum = BorshSchema.Enum({
      Ideas: BorshSchema.Unit,
      Solutions: BorshSchema.Unit,
      Attestations: BorshSchema.Unit,
      Sponsorships: BorshSchema.Unit,
      Comments: BorshSchema.Unit,
      Posts: BorshSchema.Unit,
      PostToParent: BorshSchema.Unit,
      PostToChildren: BorshSchema.Unit,
      /// Deprecated due to damaged storage state.
      LabelToPosts: BorshSchema.Unit,
      LabelToPostsV2: BorshSchema.Unit,
      AuthorToAuthorPosts: BorshSchema.Unit,
      "AuthorPosts(CryptoHash)": BorshSchema.u8,
      Communities: BorshSchema.Unit,
      AddOns: BorshSchema.Unit,
      Proposals: BorshSchema.Unit,
      LabelToProposals: BorshSchema.Unit,
      AuthorProposals: BorshSchema.Unit,
    });

    // posts: Vector::new(StorageKey::Posts),
    // post_to_parent: LookupMap::new(StorageKey::PostToParent),
    // post_to_children: LookupMap::new(StorageKey::PostToChildren),
    // label_to_posts: UnorderedMap::new(StorageKey::LabelToPostsV2),
    // access_control: AccessControl::default(),
    // authors: UnorderedMap::new(StorageKey::AuthorToAuthorPosts),
    // proposals: Vector::new(StorageKey::Proposals),
    // label_to_proposals: UnorderedMap::new(StorageKey::LabelToProposals),
    // author_proposals: UnorderedMap::new(StorageKey::AuthorProposals),
    // proposal_categories: default_categories(),
    // communities: UnorderedMap::new(StorageKey::Communities),
    // featured_communities: Vec::new(),
    // available_addons: UnorderedMap::new(StorageKey::AddOns),

    // pub posts: Vector<VersionedPost>,
    // pub post_to_parent: LookupMap<PostId, PostId>,
    // pub post_to_children: LookupMap<PostId, Vec<PostId>>,
    // pub label_to_posts: UnorderedMap<String, HashSet<PostId>>,
    // pub access_control: AccessControl,
    // pub authors: UnorderedMap<AccountId, HashSet<PostId>>,
    // pub proposals: Vector<VersionedProposal>,
    // pub label_to_proposals: UnorderedMap<String, HashSet<ProposalId>>,
    // pub author_proposals: UnorderedMap<AccountId, HashSet<ProposalId>>,
    // pub proposal_categories: Vec<String>,
    // pub communities: UnorderedMap<CommunityHandle, Community>,
    // pub featured_communities: Vec<FeaturedCommunity>,
    // pub available_addons: UnorderedMap<AddOnId, AddOn>,

    const lookupMapSchema = BorshSchema.Struct({
      key_prefix: BorshSchema.Vec(BorshSchema.u8),
      // #[borsh(skip)]
      // el: PhantomData<(K, V)>,
    });

    const unorderedMapSchema = (K: BorshSchema, V: BorshSchema) =>
      BorshSchema.Struct({
        key_index_prefix: BorshSchema.Vec(BorshSchema.u8),
        keys: BorshSchema.Vec(K),
        values: BorshSchema.Vec(V),
      });

    // (T: BorshSchema) =>
    const postIdSchema = BorshSchema.u64;

    const vectorSchema = BorshSchema.Struct({
      len: BorshSchema.u64,
      prefix: BorshSchema.Vec(BorshSchema.u8),
      // #[borsh(skip)]
      // el: PhantomData<T>,
    });

    const ruleEnum = BorshSchema.Enum({
      exactMatch: BorshSchema.String,
      startsWith: BorshSchema.String,
      any: BorshSchema.Unit,
    });

    const ruleMetadataSchema = BorshSchema.Struct({
      description: BorshSchema.String,
    });

    const versionedRuleMetadata = BorshSchema.Enum({
      v0: ruleMetadataSchema,
    });

    // FIXME: AccountId !== String
    // pub struct AccountId(pub(crate) Box<str>);
    // Box is stored on the heap
    const accountIdSchema = BorshSchema.String;

    const memberSchema = BorshSchema.Enum({
      account: accountIdSchema,
      team: BorshSchema.String,
    });

    const actionTypeSchema = BorshSchema.Enum({
      editPost: BorshSchema.Unit,
      useLabels: BorshSchema.Unit,
    });

    const memberMetaDataSchema = BorshSchema.Struct({
      description: BorshSchema.String,
      permissions: BorshSchema.HashMap(
        ruleEnum,
        BorshSchema.HashSet(actionTypeSchema)
      ),
      children: BorshSchema.HashSet(memberSchema),
      parents: BorshSchema.HashSet(memberSchema),
    });

    const versionedMemberMetaDataSchema = BorshSchema.Enum({
      v0: memberMetaDataSchema,
    });

    const accessControlSchema = BorshSchema.Struct({
      rules_list: BorshSchema.Struct({
        rules: BorshSchema.HashMap(ruleEnum, versionedRuleMetadata),
      }),
      members_list: BorshSchema.Struct({
        members: BorshSchema.HashMap(
          memberSchema,
          versionedMemberMetaDataSchema
        ),
      }),
    });

    const communitySchema = BorshSchema.Struct({
      admins: vectorSchema,
      handle: BorshSchema.String,
      name: BorshSchema.String,
      tag: BorshSchema.String,
      description: BorshSchema.String,
      logoUrl: BorshSchema.String,
      bannerUrl: BorshSchema.String,
      bioMarkdown: BorshSchema.Option(BorshSchema.String),
      githubHandle: BorshSchema.Option(BorshSchema.String),
      telegramHandle: BorshSchema.Option(BorshSchema.String),
      twitterHandle: BorshSchema.Option(BorshSchema.String),
      websiteUrl: BorshSchema.Option(BorshSchema.String),
      addons: vectorSchema,
    });

    const featuredCommunitySchema = BorshSchema.Struct({
      handle: BorshSchema.String,
    });

    const addOnSchema = BorshSchema.Struct({
      id: BorshSchema.String,
    });

    const devhubContractSchema = BorshSchema.Struct({
      posts: vectorSchema,
      post_to_parent: lookupMapSchema,
      post_to_children: lookupMapSchema,
      label_to_posts: unorderedMapSchema(
        BorshSchema.String,
        BorshSchema.HashSet(postIdSchema)
      ),
      access_control: accessControlSchema,
      authors: unorderedMapSchema(
        accountIdSchema,
        BorshSchema.HashSet(postIdSchema)
      ),
      proposals: vectorSchema,
      labels_to_proposals: unorderedMapSchema(
        BorshSchema.String,
        BorshSchema.HashSet(BorshSchema.u32)
      ),
      author_proposals: unorderedMapSchema(
        accountIdSchema,
        BorshSchema.HashSet(BorshSchema.u32)
      ),
      proposal_categories: BorshSchema.Vec(BorshSchema.String),
      communities: unorderedMapSchema(BorshSchema.String, communitySchema),
      featured_communities: BorshSchema.Vec(featuredCommunitySchema),
      available_addons: unorderedMapSchema(BorshSchema.String, addOnSchema),
    });

    console.log(devhubContractSchema.into());

    console.log({ v: addOrEditPost[0].v });

    // Error in schema, the buffer is smaller than expected
    // console.log(borshDeserialize(BorshSchema.String, addOrEditPost[0].k));

    // Error in schema, the buffer is smaller than expected
    // console.log(borshDeserialize(devhubContractSchema, addOrEditPost[0].v));

    expect(
      fromBorsh("u64", addOrEditPost[0].k.slice(1)) ===
        addOrEditPost[0].k.slice(1).readBigUInt64LE()
    );
    expect(
      fromBorsh("u32", addOrEditPost[0].v.slice(9, 13)) ===
        addOrEditPost[0].v.slice(9, 13).readUInt32LE()
    );
    expect(authorToPostId).toMatchSnapshot();
  });
});
