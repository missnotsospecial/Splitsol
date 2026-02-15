use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;

declare_id!("11111111111111111111111111111111"); // This will be replaced when you deploy

#[program]
pub mod splitsol {
    use super::*;

    /// Initialize a new friend group for expense splitting
    /// 
    /// # Arguments
    /// * `name` - The name of the group (e.g., "Weekend Trip", "Roommates")
    /// * `members` - Array of member wallet addresses to add to the group
    /// 
    /// # Example Flow:
    /// 1. Creator calls this instruction with group name and friend addresses
    /// 2. Group PDA is created and initialized
    /// 3. All members can now create expenses in this group
    pub fn create_group(
        ctx: Context<CreateGroup>,
        name: String,
        members: Vec<Pubkey>,
    ) -> Result<()> {
        let group = &mut ctx.accounts.group;
        
        // Validate inputs
        require!(name.len() > 0 && name.len() <= 50, ErrorCode::InvalidGroupName);
        require!(members.len() > 0 && members.len() <= 20, ErrorCode::InvalidMemberCount);
        
        // Initialize group
        group.authority = ctx.accounts.authority.key();
        group.name = name;
        group.members = members;
        group.member_count = group.members.len() as u8;
        group.total_expenses = 0;
        group.created_at = Clock::get()?.unix_timestamp;
        group.bump = ctx.bumps.group;
        
        msg!("✅ Group '{}' created with {} members", group.name, group.member_count);
        Ok(())
    }

    /// Create a new expense in a group
    /// 
    /// # Arguments
    /// * `description` - Description of the expense (e.g., "Dinner at restaurant")
    /// * `total_amount` - Total amount in lamports (1 SOL = 1,000,000,000 lamports)
    /// * `split_amounts` - Array of amounts each member owes (in lamports)
    /// 
    /// # Payment Flow:
    /// 1. Creator records the expense with split amounts
    /// 2. Each member can see their QR code with their specific amount
    /// 3. Members scan and pay their share
    /// 4. Once all paid, expense is marked as settled
    pub fn create_expense(
        ctx: Context<CreateExpense>,
        description: String,
        total_amount: u64,
        split_amounts: Vec<u64>,
    ) -> Result<()> {
        let expense = &mut ctx.accounts.expense;
        let group = &mut ctx.accounts.group;
        
        // Validate inputs
        require!(description.len() > 0 && description.len() <= 200, ErrorCode::InvalidDescription);
        require!(total_amount > 0, ErrorCode::InvalidAmount);
        require!(split_amounts.len() == group.members.len(), ErrorCode::MismatchedSplitCount);
        
        // Verify split amounts add up to total
        let sum: u64 = split_amounts.iter().sum();
        require!(sum == total_amount, ErrorCode::InvalidSplitSum);
        
        // Initialize expense
        expense.group = ctx.accounts.group.key();
        expense.payer = ctx.accounts.payer.key();
        expense.description = description.clone();
        expense.total_amount = total_amount;
        expense.split_amounts = split_amounts;
        expense.paid_status = vec![false; group.members.len()];
        expense.created_at = Clock::get()?.unix_timestamp;
        expense.settled = false;
        expense.bump = ctx.bumps.expense;
        
        // Update group stats
        group.total_expenses += 1;
        
        msg!("💸 Expense created: '{}' for {} lamports", description, total_amount);
        Ok(())
    }

    /// Mark a member's payment as received
    /// 
    /// # Arguments
    /// * `member_index` - Index of the member in the group members array
    /// 
    /// # Flow:
    /// 1. Member scans QR code with their payment info
    /// 2. Wallet app creates transaction calling this instruction
    /// 3. Payment is transferred to payer
    /// 4. Member's paid status is updated
    /// 5. If all members paid, expense is marked as settled
    pub fn pay_expense(
        ctx: Context<PayExpense>,
        member_index: u8,
    ) -> Result<()> {
        let expense = &mut ctx.accounts.expense;
        let group = &ctx.accounts.group;
        
        // Validate member index
        require!((member_index as usize) < group.members.len(), ErrorCode::InvalidMemberIndex);
        
        // Verify the payer is the correct member
        let member_pubkey = group.members[member_index as usize];
        require!(ctx.accounts.member.key() == member_pubkey, ErrorCode::UnauthorizedMember);
        
        // Check if already paid
        require!(!expense.paid_status[member_index as usize], ErrorCode::AlreadyPaid);
        
        // Get the amount this member owes
        let amount = expense.split_amounts[member_index as usize];
        
        // Transfer SOL from member to payer
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.member.key(),
            &ctx.accounts.payer.key(),
            amount,
        );
        
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.member.to_account_info(),
                ctx.accounts.payer.to_account_info(),
            ],
        )?;
        
        // Mark as paid
        expense.paid_status[member_index as usize] = true;
        
        // Check if all members have paid
        if expense.paid_status.iter().all(|&paid| paid) {
            expense.settled = true;
            msg!("🎉 Expense fully settled!");
        }
        
        msg!("✓ Member {} paid {} lamports", member_index, amount);
        Ok(())
    }

    /// Add a new member to an existing group
    /// 
    /// # Arguments
    /// * `new_member` - Public key of the new member to add
    /// 
    /// Only the group authority (creator) can add members
    pub fn add_member(
        ctx: Context<AddMember>,
        new_member: Pubkey,
    ) -> Result<()> {
        let group = &mut ctx.accounts.group;
        
        // Validate authority
        require!(group.authority == ctx.accounts.authority.key(), ErrorCode::Unauthorized);
        
        // Check member limit
        require!(group.members.len() < 20, ErrorCode::GroupFull);
        
        // Check if member already exists
        require!(!group.members.contains(&new_member), ErrorCode::MemberAlreadyExists);
        
        // Add member
        group.members.push(new_member);
        group.member_count += 1;
        
        msg!("👥 New member added to group '{}'", group.name);
        Ok(())
    }
}

// ============================================================================
// Account Structures
// ============================================================================

/// Group account - stores friend group information
/// 
/// PDA Seeds: ["group", authority.key(), name.as_bytes()]
#[account]
pub struct Group {
    /// The creator/owner of the group
    pub authority: Pubkey,
    
    /// Name of the group (max 50 chars)
    pub name: String,
    
    /// Array of member public keys
    pub members: Vec<Pubkey>,
    
    /// Total number of members
    pub member_count: u8,
    
    /// Total number of expenses created
    pub total_expenses: u64,
    
    /// Timestamp when group was created
    pub created_at: i64,
    
    /// PDA bump seed
    pub bump: u8,
}

/// Expense account - stores expense splitting information
/// 
/// PDA Seeds: ["expense", group.key(), payer.key(), timestamp]
#[account]
pub struct Expense {
    /// Reference to the group this expense belongs to
    pub group: Pubkey,
    
    /// The person who paid and is owed
    pub payer: Pubkey,
    
    /// Description of the expense
    pub description: String,
    
    /// Total amount in lamports
    pub total_amount: u64,
    
    /// Array of amounts each member owes (corresponds to group.members)
    pub split_amounts: Vec<u64>,
    
    /// Array of payment status for each member
    pub paid_status: Vec<bool>,
    
    /// Whether all members have paid
    pub settled: bool,
    
    /// Timestamp when expense was created
    pub created_at: i64,
    
    /// PDA bump seed
    pub bump: u8,
}

// ============================================================================
// Context Structs (Instruction Validation)
// ============================================================================

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateGroup<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Group::INIT_SPACE,
        seeds = [b"group", authority.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub group: Account<'info, Group>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(description: String)]
pub struct CreateExpense<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Expense::INIT_SPACE,
        seeds = [
            b"expense",
            group.key().as_ref(),
            payer.key().as_ref(),
            &Clock::get()?.unix_timestamp.to_le_bytes()
        ],
        bump
    )]
    pub expense: Account<'info, Expense>,
    
    #[account(mut)]
    pub group: Account<'info, Group>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayExpense<'info> {
    #[account(mut)]
    pub expense: Account<'info, Expense>,
    
    pub group: Account<'info, Group>,
    
    /// Member paying their share
    #[account(mut)]
    pub member: Signer<'info>,
    
    /// Original payer receiving the funds
    /// CHECK: This is safe because we're just transferring to this account
    #[account(mut)]
    pub payer: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddMember<'info> {
    #[account(mut)]
    pub group: Account<'info, Group>,
    
    pub authority: Signer<'info>,
}

// ============================================================================
// Account Space Calculations
// ============================================================================

impl Group {
    pub const INIT_SPACE: usize = 
        32 +    // authority
        4 + 50 + // name (String = 4 bytes length + max 50 chars)
        4 + (32 * 20) + // members (Vec = 4 bytes length + max 20 pubkeys * 32 bytes)
        1 +     // member_count
        8 +     // total_expenses
        8 +     // created_at
        1;      // bump
}

impl Expense {
    pub const INIT_SPACE: usize = 
        32 +    // group
        32 +    // payer
        4 + 200 + // description (String = 4 bytes length + max 200 chars)
        8 +     // total_amount
        4 + (8 * 20) + // split_amounts (Vec = 4 bytes length + max 20 * u64)
        4 + (1 * 20) + // paid_status (Vec = 4 bytes length + max 20 * bool)
        1 +     // settled
        8 +     // created_at
        1;      // bump
}

// ============================================================================
// Error Codes
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Group name must be between 1 and 50 characters")]
    InvalidGroupName,
    
    #[msg("Group must have between 1 and 20 members")]
    InvalidMemberCount,
    
    #[msg("Description must be between 1 and 200 characters")]
    InvalidDescription,
    
    #[msg("Amount must be greater than 0")]
    InvalidAmount,
    
    #[msg("Number of split amounts must match number of group members")]
    MismatchedSplitCount,
    
    #[msg("Split amounts must add up to total amount")]
    InvalidSplitSum,
    
    #[msg("Invalid member index")]
    InvalidMemberIndex,
    
    #[msg("You are not authorized to perform this action")]
    UnauthorizedMember,
    
    #[msg("This member has already paid their share")]
    AlreadyPaid,
    
    #[msg("Only the group creator can perform this action")]
    Unauthorized,
    
    #[msg("Group is at maximum capacity (20 members)")]
    GroupFull,
    
    #[msg("Member already exists in this group")]
    MemberAlreadyExists,
}
