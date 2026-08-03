export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  gender: "Male" | "Female";
  dateOfBirth: string;
  baptismStatus: "Baptized" | "Not Baptized";
  ministryGroup: string;
  joinDate: string;
  photo?: string;
}

export interface Ministry {
  id: string;
  name: string;
  description: string;
  leader: string;
  memberCount: number;
  color: string;
}

export interface FinancialRecord {
  id: string;
  date: string;
  type: "Tithe" | "Offering" | "Mission" | "Baby Center" | "Special Giving";
  memberName: string;
  amount: number;
  description: string;
}

export interface ChurchEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  type: "Service" | "Fellowship" | "Meeting" | "Special Event";
}

export interface AttendanceRecord {
  id: string;
  date: string;
  serviceType: "Sunday Service" | "Thursday Fellowship" | "Special Service";
  men: number;
  women: number;
  youths: number;
  children: number;
  visitors: number;
  totalAttendees: number;
}

export const mockMembers: Member[] = [
  { id: "1", firstName: "John", lastName: "Kipkoech", phone: "+254712345678", email: "john@example.com", address: "Cheswerta Village", gender: "Male", dateOfBirth: "1985-03-15", baptismStatus: "Baptized", ministryGroup: "Men", joinDate: "2015-01-10" },
  { id: "2", firstName: "Mary", lastName: "Chepkorir", phone: "+254723456789", email: "mary@example.com", address: "Cheswerta Town", gender: "Female", dateOfBirth: "1990-07-22", baptismStatus: "Baptized", ministryGroup: "Women", joinDate: "2016-05-20" },
  { id: "3", firstName: "David", lastName: "Kibet", phone: "+254734567890", email: "david@example.com", address: "Cheswerta Estate", gender: "Male", dateOfBirth: "1998-11-08", baptismStatus: "Not Baptized", ministryGroup: "Youth", joinDate: "2020-02-14" },
  { id: "4", firstName: "Grace", lastName: "Jeptoo", phone: "+254745678901", email: "grace@example.com", address: "Cheswerta Village", gender: "Female", dateOfBirth: "1995-01-30", baptismStatus: "Baptized", ministryGroup: "Choir", joinDate: "2018-08-05" },
  { id: "5", firstName: "Peter", lastName: "Rotich", phone: "+254756789012", email: "peter@example.com", address: "Cheswerta Market", gender: "Male", dateOfBirth: "1978-06-12", baptismStatus: "Baptized", ministryGroup: "Men", joinDate: "2010-03-01" },
  { id: "6", firstName: "Sarah", lastName: "Chebet", phone: "+254767890123", email: "sarah@example.com", address: "Cheswerta Primary", gender: "Female", dateOfBirth: "2002-09-18", baptismStatus: "Not Baptized", ministryGroup: "Sunday School", joinDate: "2021-07-12" },
  { id: "7", firstName: "James", lastName: "Kiptoo", phone: "+254778901234", email: "james@example.com", address: "Cheswerta Center", gender: "Male", dateOfBirth: "1988-04-25", baptismStatus: "Baptized", ministryGroup: "Youth", joinDate: "2017-11-30" },
  { id: "8", firstName: "Ruth", lastName: "Jepchirchir", phone: "+254789012345", email: "ruth@example.com", address: "Cheswerta Village", gender: "Female", dateOfBirth: "1992-12-03", baptismStatus: "Baptized", ministryGroup: "Women", joinDate: "2019-04-22" },
];

export const mockMinistries: Ministry[] = [
  { id: "1", name: "Men", description: "Mentoring and equipping men for spiritual leadership", leader: "Peter Rotich", memberCount: 38, color: "bg-primary" },
  { id: "2", name: "Women", description: "Building strong women of faith in the community", leader: "Mary Chepkorir", memberCount: 62, color: "bg-accent" },
  { id: "3", name: "Youths", description: "Empowering young people through faith and fellowship", leader: "David Kibet", memberCount: 45, color: "bg-success" },
  { id: "4", name: "Children", description: "Teaching children the word of God", leader: "Sarah Chebet", memberCount: 55, color: "bg-primary" },
  { id: "5", name: "Evangelism", description: "Spreading the gospel to the community and beyond", leader: "James Kiptoo", memberCount: 20, color: "bg-accent" },
  { id: "6", name: "Mission", description: "Supporting and coordinating mission outreach", leader: "John Kipkoech", memberCount: 15, color: "bg-success" },
  { id: "7", name: "Compassion", description: "Caring for the needy and vulnerable in the community", leader: "Ruth Jepchirchir", memberCount: 22, color: "bg-primary" },
  { id: "8", name: "Education", description: "Promoting education and scholarship programs", leader: "Grace Jeptoo", memberCount: 18, color: "bg-accent" },
  { id: "9", name: "Discipleship", description: "Nurturing believers in spiritual growth and maturity", leader: "Peter Rotich", memberCount: 25, color: "bg-success" },
];

export const mockFinancials: FinancialRecord[] = [
  { id: "1", date: "2026-03-15", type: "Tithe", memberName: "John Kipkoech", amount: 5000, description: "Monthly tithe" },
  { id: "2", date: "2026-03-15", type: "Offering", memberName: "—", amount: 2000, description: "Sunday offering" },
  { id: "3", date: "2026-03-14", type: "Mission", memberName: "—", amount: 15000, description: "Mission support fund" },
  { id: "4", date: "2026-03-13", type: "Tithe", memberName: "Grace Jeptoo", amount: 3500, description: "Monthly tithe" },
  { id: "5", date: "2026-03-12", type: "Special Giving", memberName: "—", amount: 10000, description: "Youth camp sponsorship" },
  { id: "6", date: "2026-03-10", type: "Offering", memberName: "—", amount: 1500, description: "Thursday offering" },
  { id: "7", date: "2026-03-08", type: "Tithe", memberName: "David Kibet", amount: 4000, description: "Monthly tithe" },
  { id: "8", date: "2026-03-05", type: "Baby Center", memberName: "—", amount: 8000, description: "Baby center ministry fund" },
];

export const mockEvents: ChurchEvent[] = [
  { id: "1", title: "Sunday Worship Service", date: "2026-03-22", time: "09:00 AM", location: "Main Sanctuary", description: "Weekly Sunday worship service", type: "Service" },
  { id: "2", title: "Thursday Fellowship", date: "2026-03-19", time: "06:00 PM", location: "Church Hall", description: "Thursday evening Bible study and prayer", type: "Fellowship" },
  { id: "3", title: "Youth Conference", date: "2026-04-05", time: "08:00 AM", location: "Main Sanctuary", description: "Annual youth empowerment conference", type: "Special Event" },
  { id: "4", title: "Church Leaders Meeting", date: "2026-03-20", time: "04:00 PM", location: "Pastor's Office", description: "Monthly leadership planning meeting", type: "Meeting" },
  { id: "5", title: "Easter Service", date: "2026-04-05", time: "07:00 AM", location: "Main Sanctuary", description: "Easter Sunday celebration service", type: "Service" },
  { id: "6", title: "Women's Prayer Breakfast", date: "2026-03-28", time: "07:00 AM", location: "Church Hall", description: "Monthly women's fellowship and prayer", type: "Fellowship" },
];

export const mockAttendance: AttendanceRecord[] = [
  { id: "1", date: "2026-03-16", serviceType: "Sunday Service", men: 68, women: 82, youths: 45, children: 30, visitors: 9, totalAttendees: 234 },
  { id: "2", date: "2026-03-13", serviceType: "Thursday Fellowship", men: 22, women: 35, youths: 18, children: 8, visitors: 6, totalAttendees: 89 },
  { id: "3", date: "2026-03-09", serviceType: "Sunday Service", men: 75, women: 88, youths: 50, children: 32, visitors: 11, totalAttendees: 256 },
  { id: "4", date: "2026-03-06", serviceType: "Thursday Fellowship", men: 25, women: 38, youths: 20, children: 6, visitors: 6, totalAttendees: 95 },
  { id: "5", date: "2026-03-02", serviceType: "Sunday Service", men: 70, women: 85, youths: 48, children: 28, visitors: 14, totalAttendees: 245 },
  { id: "6", date: "2026-02-27", serviceType: "Thursday Fellowship", men: 20, women: 30, youths: 16, children: 10, visitors: 6, totalAttendees: 82 },
];

export const monthlyAttendanceData = [
  { month: "Oct", sunday: 220, thursday: 78 },
  { month: "Nov", sunday: 235, thursday: 85 },
  { month: "Dec", sunday: 280, thursday: 72 },
  { month: "Jan", sunday: 210, thursday: 88 },
  { month: "Feb", sunday: 248, thursday: 92 },
  { month: "Mar", sunday: 256, thursday: 95 },
];

export const monthlyFinanceData = [
  { month: "Oct", tithes: 125000, offerings: 45000, mission: 20000, babyCenter: 12000 },
  { month: "Nov", tithes: 138000, offerings: 52000, mission: 18000, babyCenter: 15000 },
  { month: "Dec", tithes: 165000, offerings: 78000, mission: 25000, babyCenter: 20000 },
  { month: "Jan", tithes: 118000, offerings: 42000, mission: 15000, babyCenter: 10000 },
  { month: "Feb", tithes: 142000, offerings: 55000, mission: 22000, babyCenter: 14000 },
  { month: "Mar", tithes: 155000, offerings: 62000, mission: 24000, babyCenter: 16000 },
];
