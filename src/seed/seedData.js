require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Department = require('../models/Department');
const Form = require('../models/Form');
const Question = require('../models/Question');
const FormVersion = require('../models/FormVersion');
const Submission = require('../models/Submission');
const SubmissionReceipt = require('../models/SubmissionReceipt');
const Complaint = require('../models/Complaint');
const ComplaintMessage = require('../models/ComplaintMessage');
const ComplaintStatusHistory = require('../models/ComplaintStatusHistory');
const Announcement = require('../models/Announcement');
const AuditLog = require('../models/AuditLog');
const SystemSetting = require('../models/SystemSetting');

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/campusvoice');
    console.log('[Seed] Connected to database. Clearing existing records...');

    // Clear collections
    await Promise.all([
      User.deleteMany({}),
      Department.deleteMany({}),
      Form.deleteMany({}),
      Question.deleteMany({}),
      FormVersion.deleteMany({}),
      Submission.deleteMany({}),
      SubmissionReceipt.deleteMany({}),
      Complaint.deleteMany({}),
      ComplaintMessage.deleteMany({}),
      ComplaintStatusHistory.deleteMany({}),
      Announcement.deleteMany({}),
      AuditLog.deleteMany({}),
      SystemSetting.deleteMany({}),
    ]);

    console.log('[Seed] Seeding Departments...');
    const departments = await Department.insertMany([
      {
        name: 'Computer Science & Engineering',
        code: 'CSE',
        type: 'academic',
        headOfDepartment: 'Dr. Aris Thorne',
        contactEmail: 'hod.cse@campusvoice.edu',
        phone: '+91-98765-43210',
      },
      {
        name: 'Electronics & Communication',
        code: 'ECE',
        type: 'academic',
        headOfDepartment: 'Dr. Sunita Rao',
        contactEmail: 'hod.ece@campusvoice.edu',
        phone: '+91-98765-43211',
      },
      {
        name: 'Mechanical Engineering',
        code: 'MECH',
        type: 'academic',
        headOfDepartment: 'Dr. Robert Henderson',
        contactEmail: 'hod.mech@campusvoice.edu',
        phone: '+91-98765-43212',
      },
      {
        name: 'Business Administration & Management',
        code: 'MBA',
        type: 'academic',
        headOfDepartment: 'Dr. Meenakshi Sundaram',
        contactEmail: 'hod.mba@campusvoice.edu',
        phone: '+91-98765-43213',
      },
      {
        name: 'Campus Facilities & Maintenance',
        code: 'FACILITIES',
        type: 'facility',
        headOfDepartment: 'Eng. Prakash Mehta',
        contactEmail: 'estate.manager@campusvoice.edu',
        phone: '+91-98765-43214',
      },
      {
        name: 'Central Library Services',
        code: 'LIB',
        type: 'support',
        headOfDepartment: 'Mrs. Deepa Krishnan',
        contactEmail: 'library@campusvoice.edu',
        phone: '+91-98765-43215',
      },
      {
        name: 'Food & Canteen Committee',
        code: 'CANTEEN',
        type: 'facility',
        headOfDepartment: 'Mr. Harish Verma',
        contactEmail: 'canteen.admin@campusvoice.edu',
        phone: '+91-98765-43216',
      },
      {
        name: 'Student Affairs & Welfare',
        code: 'SAW',
        type: 'administrative',
        headOfDepartment: 'Prof. Ananya Roy',
        contactEmail: 'student.affairs@campusvoice.edu',
        phone: '+91-98765-43217',
      },
      {
        name: 'IT',
        code: 'IT',
        type: 'academic',
        headOfDepartment: 'Prof. Ramesh Gupta',
        contactEmail: 'hod.it@campusvoice.edu',
        phone: '+91-98765-43220',
      },
      {
        name: 'MJ',
        code: 'MJ',
        type: 'academic',
        headOfDepartment: 'Dr. Shalini Joshi',
        contactEmail: 'hod.mj@campusvoice.edu',
        phone: '+91-98765-43221',
      },
      {
        name: 'B-voc',
        code: 'BVOC',
        type: 'academic',
        headOfDepartment: 'Prof. Sandeep Kulkarni',
        contactEmail: 'hod.bvoc@campusvoice.edu',
        phone: '+91-98765-43222',
      },
    ]);

    const deptMap = {};
    departments.forEach((d) => {
      deptMap[d.code] = d._id;
    });

    console.log('[Seed] Seeding Users with Role-Based Access...');
    // Create Users
    // 1. Super Admin
    const superAdmin = await User.create({
      name: 'Dr. Vikram Sengupta',
      email: 'admin@campusvoice.edu',
      password: 'Admin@2026',
      role: 'super_admin',
      department: deptMap['SAW'],
      phone: '+91-99999-10001',
      accountStatus: 'active',
      status: 'active',
    });

    // 2. HR Managers
    const hrAnita = await User.create({
      name: 'Anita Deshmukh',
      email: 'anita.deshmukh@campus.edu',
      password: 'Admin@2026',
      role: 'hr_officer',
      department: deptMap['SAW'],
      phone: '+91-99999-10002',
      accountStatus: 'active',
      status: 'active',
    });

    const hrRajesh = await User.create({
      name: 'Prof. Rajesh Kumar',
      email: 'rajesh.k@campus.edu',
      password: 'Admin@2026',
      role: 'hr_officer',
      department: deptMap['FACILITIES'],
      phone: '+91-99999-10003',
      accountStatus: 'active',
      status: 'active',
    });

    // 3. Students
    const studentRahul = await User.create({
      name: 'Rahul Sharma',
      email: 'rahul.sharma@campus.edu',
      password: 'Student@2026',
      role: 'student',
      studentId: 'STU-2024-0104',
      department: deptMap['CSE'],
      academicYear: '3rd Year',
      phone: '+91-98111-22201',
      status: 'active',
    });

    const studentPriya = await User.create({
      name: 'Priya Patel',
      email: 'priya.patel@campus.edu',
      password: 'Student@2026',
      role: 'student',
      studentId: 'STU-2025-0219',
      department: deptMap['ECE'],
      academicYear: '2nd Year',
      phone: '+91-98111-22202',
      status: 'active',
    });

    const studentArjun = await User.create({
      name: 'Arjun Nair',
      email: 'arjun.nair@campus.edu',
      password: 'Student@2026',
      role: 'student',
      studentId: 'STU-2023-0082',
      department: deptMap['MECH'],
      academicYear: '4th Year',
      phone: '+91-98111-22203',
      status: 'active',
    });

    const studentAnanya = await User.create({
      name: 'Ananya Sen',
      email: 'ananya.sen@campus.edu',
      password: 'Student@2026',
      role: 'student',
      studentId: 'STU-2026-0311',
      department: deptMap['MBA'],
      academicYear: '1st Year',
      phone: '+91-98111-22204',
      status: 'active',
    });

    console.log('[Seed] Seeding Feedback Forms and Questions...');
    // Form 1: Faculty Evaluation (Anonymous)
    const form1 = await Form.create({
      title: 'Mid-Semester Faculty & Teaching Effectiveness Survey - Fall 2026',
      description:
        'This confidential survey assesses pedagogical clarity, curriculum alignment, and interactive lab sessions. Responses are completely anonymous.',
      category: 'Faculty Evaluation',
      targetAudience: 'all',
      eligibleDepartments: [deptMap['CSE'], deptMap['ECE'], deptMap['MECH'], deptMap['MBA']],
      eligibleAcademicYears: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate'],
      startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      estimatedTimeMinutes: 6,
      isAnonymous: true,
      maxSubmissionsPerStudent: 1,
      isRequired: true,
      status: 'published',
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      createdBy: hrAnita._id,
    });

    const form1Questions = await Question.insertMany([
      {
        form: form1._id,
        label: 'Select Course & Instructor',
        questionType: 'dropdown',
        isRequired: true,
        options: [
          'CS301 - Distributed Systems (Dr. Aris Thorne)',
          'CS304 - Database Architecture (Prof. Neha Gupta)',
          'EC202 - Digital Signal Processing (Dr. Sunita Rao)',
          'ME401 - Thermodynamics & Heat Transfer (Dr. Robert Henderson)',
        ],
        order: 1,
      },
      {
        form: form1._id,
        label: 'How clearly does the faculty communicate difficult technical concepts?',
        questionType: 'rating_5',
        isRequired: true,
        scaleConfig: { min: 1, max: 5, minLabel: 'Very Unclear', maxLabel: 'Exceptionally Clear' },
        order: 2,
      },
      {
        form: form1._id,
        label: 'Rate instructor preparedness and timeliness (1 to 10 scale)',
        questionType: 'rating_10',
        isRequired: true,
        scaleConfig: { min: 1, max: 10, minLabel: 'Needs Urgent Improvement', maxLabel: 'Exemplary' },
        order: 3,
      },
      {
        form: form1._id,
        label: 'Are practical laboratory experiments aligned with weekly theory lectures?',
        questionType: 'yes_no',
        isRequired: true,
        options: ['Yes', 'No'],
        order: 4,
      },
      {
        form: form1._id,
        label: 'What aspects of this course or teaching style do you find most valuable?',
        questionType: 'long_text',
        placeholder: 'e.g., Real-world case studies, open question forums...',
        isRequired: false,
        order: 5,
      },
      {
        form: form1._id,
        label: 'Constructive recommendations for instructional improvement',
        questionType: 'long_text',
        placeholder: 'Provide specific feedback on pace, reference material, or assignments...',
        isRequired: false,
        order: 6,
      },
    ]);

    // Snapshot form 1 version
    await FormVersion.create({
      form: form1._id,
      versionNumber: 1,
      title: form1.title,
      description: form1.description,
      questionsSnapshot: form1Questions,
      changedBy: hrAnita._id,
      changeSummary: 'Initial publication of mid-semester faculty survey',
    });

    // Form 2: Campus Infrastructure & Wi-Fi Quality (Identified)
    const form2 = await Form.create({
      title: 'Campus Infrastructure, Lab Facilities & Wi-Fi Quality Review',
      description:
        'Help the administration identify laboratory equipment shortages, network blackspots, and study hall maintenance requirements.',
      category: 'Campus Facilities',
      targetAudience: 'all',
      eligibleDepartments: [deptMap['CSE'], deptMap['ECE'], deptMap['MECH'], deptMap['MBA']],
      eligibleAcademicYears: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
      startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      estimatedTimeMinutes: 5,
      isAnonymous: false,
      maxSubmissionsPerStudent: 1,
      isRequired: false,
      status: 'published',
      publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      createdBy: hrRajesh._id,
    });

    const form2Questions = await Question.insertMany([
      {
        form: form2._id,
        label: 'Academic Block or Campus Area you utilize most',
        questionType: 'dropdown',
        isRequired: true,
        options: [
          'Academic Block A (Engineering Labs & Classrooms)',
          'Academic Block B (Computing Centers & Seminar Halls)',
          'Central Library & Digital Reading Room',
          'Student Activity & Sports Complex',
          'Hostel Blocks & Dining Hall',
        ],
        order: 1,
      },
      {
        form: form2._id,
        label: 'High-speed Wi-Fi stability & speed in your primary study zone',
        questionType: 'linear_scale',
        scaleConfig: { min: 1, max: 5, minLabel: 'Frequent Disconnects', maxLabel: 'Lightning Fast & Seamless' },
        isRequired: true,
        order: 2,
      },
      {
        form: form2._id,
        label: 'Hygiene and cleanliness of restrooms and water stations',
        questionType: 'rating_5',
        isRequired: true,
        order: 3,
      },
      {
        form: form2._id,
        label: 'Which facilities require prompt administrative attention?',
        questionType: 'checkbox',
        isRequired: true,
        options: [
          'High-speed Wi-Fi Coverage',
          'Air Conditioning / Ventilation in Classrooms',
          'Modern Lab Equipment & Computers',
          'Library Study Desks & Power Outlets',
          'Cafeteria Seating Capacity',
        ],
        order: 4,
      },
      {
        form: form2._id,
        label: 'Detailed suggestions or specific locations needing repair',
        questionType: 'long_text',
        placeholder: 'Specify room numbers, equipment names, or issues...',
        isRequired: false,
        order: 5,
      },
    ]);

    await FormVersion.create({
      form: form2._id,
      versionNumber: 1,
      title: form2.title,
      description: form2.description,
      questionsSnapshot: form2Questions,
      changedBy: hrRajesh._id,
      changeSummary: 'Campus facilities survey published',
    });

    // Form 3: Canteen & Hygiene (Draft)
    const form3 = await Form.create({
      title: 'Hostel & Cafeteria Nutritional Quality & Pricing Assessment',
      description:
        'Survey regarding dining hall freshness, menu variety, hygiene standards, and price fairness.',
      category: 'Hostel & Canteen',
      targetAudience: 'all',
      eligibleDepartments: [],
      eligibleAcademicYears: [],
      startDate: new Date(),
      endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      estimatedTimeMinutes: 4,
      isAnonymous: true,
      maxSubmissionsPerStudent: 1,
      isRequired: false,
      status: 'draft',
      createdBy: hrAnita._id,
    });

    await Question.insertMany([
      {
        form: form3._id,
        label: 'How often do you eat at the college cafeteria?',
        questionType: 'multiple_choice',
        options: ['Daily', '3-4 times a week', 'Occasionally', 'Rarely'],
        order: 1,
      },
      {
        form: form3._id,
        label: 'Food freshness and hygiene rating',
        questionType: 'rating_5',
        order: 2,
      },
      {
        form: form3._id,
        label: 'What menu additions would you recommend?',
        questionType: 'short_text',
        order: 3,
      },
    ]);

    console.log('[Seed] Seeding Submissions and Participation Receipts...');
    // Seed Anonymous Submissions for Form 1 (Faculty Survey)
    // Note: In Form 1 (anonymous), Submission has student: null!
    await Submission.create({
      form: form1._id,
      formVersion: 1,
      isAnonymous: true,
      student: null, // Strictly null
      answers: [
        {
          question: form1Questions[0]._id,
          questionLabel: form1Questions[0].label,
          questionType: form1Questions[0].questionType,
          value: 'CS301 - Distributed Systems (Dr. Aris Thorne)',
        },
        {
          question: form1Questions[1]._id,
          questionLabel: form1Questions[1].label,
          questionType: form1Questions[1].questionType,
          value: 5,
        },
        {
          question: form1Questions[2]._id,
          questionLabel: form1Questions[2].label,
          questionType: form1Questions[2].questionType,
          value: 9,
        },
        {
          question: form1Questions[3]._id,
          questionLabel: form1Questions[3].label,
          questionType: form1Questions[3].questionType,
          value: 'Yes',
        },
        {
          question: form1Questions[4]._id,
          questionLabel: form1Questions[4].label,
          questionType: form1Questions[4].questionType,
          value: 'Hands-on demos with Kubernetes and Docker in lab sessions were brilliant.',
        },
        {
          question: form1Questions[5]._id,
          questionLabel: form1Questions[5].label,
          questionType: form1Questions[5].questionType,
          value: 'More time for Q&A after complex proofs would help slower learners.',
        },
      ],
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });

    await Submission.create({
      form: form1._id,
      formVersion: 1,
      isAnonymous: true,
      student: null,
      answers: [
        {
          question: form1Questions[0]._id,
          questionLabel: form1Questions[0].label,
          questionType: form1Questions[0].questionType,
          value: 'CS304 - Database Architecture (Prof. Neha Gupta)',
        },
        {
          question: form1Questions[1]._id,
          questionLabel: form1Questions[1].label,
          questionType: form1Questions[1].questionType,
          value: 4,
        },
        {
          question: form1Questions[2]._id,
          questionLabel: form1Questions[2].label,
          questionType: form1Questions[2].questionType,
          value: 8,
        },
        {
          question: form1Questions[3]._id,
          questionLabel: form1Questions[3].label,
          questionType: form1Questions[3].questionType,
          value: 'Yes',
        },
        {
          question: form1Questions[4]._id,
          questionLabel: form1Questions[4].label,
          questionType: form1Questions[4].questionType,
          value: 'SQL indexing queries were explained thoroughly.',
        },
        {
          question: form1Questions[5]._id,
          questionLabel: form1Questions[5].label,
          questionType: form1Questions[5].questionType,
          value: 'Provide assignment solutions PDF after submission deadlines.',
        },
      ],
      submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });

    // Seed Participation Receipts for Rahul & Priya
    // Demonstrates participation tracking without compromising response anonymity
    await SubmissionReceipt.create({
      form: form1._id,
      student: studentRahul._id,
      receiptCode: 'CV-RCPT-A7E291F0',
      isAnonymous: true,
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });

    await SubmissionReceipt.create({
      form: form1._id,
      student: studentPriya._id,
      receiptCode: 'CV-RCPT-B4C189D2',
      isAnonymous: true,
      submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });

    console.log('[Seed] Seeding Realistic Grievance Complaints with Complete Lifecycles...');
    // Complaint 1: In Progress
    const comp1 = await Complaint.create({
      ticketId: 'CV-2026-1048',
      title: 'Severe Wi-Fi connectivity blackspot on 3rd Floor CSE Lab Corridor (Block B)',
      category: 'Internet and technical issue',
      department: deptMap['CSE'],
      location: 'Block B, 3rd Floor, outside Labs 301-305',
      description:
        'During practical coding exams and project reviews, the campus Wi-Fi signal drops completely in the corridor. Students cannot push code to Git repositories or load courseware documents.',
      incidentDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      priority: 'high',
      isAnonymous: false,
      student: studentRahul._id,
      status: 'in_progress',
      assignedDepartment: deptMap['FACILITIES'],
      assignedStaff: hrRajesh._id,
    });

    await ComplaintStatusHistory.insertMany([
      {
        complaint: comp1._id,
        previousStatus: 'none',
        newStatus: 'new',
        changedBy: studentRahul._id,
        changedByName: studentRahul.name,
        reasonOrNote: 'Complaint registered by student',
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
      {
        complaint: comp1._id,
        previousStatus: 'new',
        newStatus: 'under_review',
        changedBy: hrAnita._id,
        changedByName: hrAnita.name,
        reasonOrNote: 'Grievance cell reviewed initial complaint report and flagged for IT infrastructure team.',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        complaint: comp1._id,
        previousStatus: 'under_review',
        newStatus: 'assigned',
        changedBy: hrAnita._id,
        changedByName: hrAnita.name,
        reasonOrNote: 'Assigned to Campus Facilities & Network Infrastructure Unit.',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        complaint: comp1._id,
        previousStatus: 'assigned',
        newStatus: 'in_progress',
        changedBy: hrRajesh._id,
        changedByName: hrRajesh.name,
        reasonOrNote: 'Hardware technician surveyed floor APs; PoE switch port 8 requires replacement.',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ]);

    await ComplaintMessage.insertMany([
      {
        complaint: comp1._id,
        sender: studentRahul._id,
        senderRole: 'student',
        senderName: 'Rahul Sharma',
        isInternalNote: false,
        message: 'Sir/Madam, the signal completely vanishes near Lab 304. Can an additional mesh repeater be mounted?',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        complaint: comp1._id,
        sender: hrRajesh._id,
        senderRole: 'hr_officer',
        senderName: 'Prof. Rajesh Kumar',
        isInternalNote: true, // INTERNAL NOTE (NEVER VISIBLE TO STUDENTS)
        message:
          '[INTERNAL IT NOTE] Network engineer inspected Access Point #AP-B3-04. The RJ45 termination was oxidized and the Cisco PoE injector was overheating. Replacement parts requisition #PO-9912 placed.',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        complaint: comp1._id,
        sender: hrRajesh._id,
        senderRole: 'hr_officer',
        senderName: 'Prof. Rajesh Kumar',
        isInternalNote: false, // PUBLIC RESPONSE TO STUDENT
        message:
          'Hello Rahul, our network engineering team has inspected the corridor access points. Replacement equipment has been procured and installation is scheduled for tomorrow morning.',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ]);

    // Complaint 2: Resolved
    const comp2 = await Complaint.create({
      ticketId: 'CV-2026-2180',
      title: 'Water dispenser malfunction and inadequate sanitation in Block A 2nd Floor',
      category: 'Washroom and cleanliness',
      department: deptMap['FACILITIES'],
      location: 'Block A, 2nd Floor East Wing',
      description:
        'The cold water purifier filter is displaying a red service alert and water is leaking across the floor, creating a slipping hazard.',
      incidentDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      priority: 'medium',
      isAnonymous: false,
      student: studentPriya._id,
      status: 'resolved',
      assignedDepartment: deptMap['FACILITIES'],
      assignedStaff: hrRajesh._id,
      resolutionSummary:
        'Maintenance crew replaced dual carbon filters and UV lamp in RO dispenser #A2-RO1. Housekeeping completed sanitization of floor.',
      resolvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });

    await ComplaintStatusHistory.insertMany([
      {
        complaint: comp2._id,
        previousStatus: 'none',
        newStatus: 'new',
        changedBy: studentPriya._id,
        changedByName: studentPriya.name,
        reasonOrNote: 'Sanitation report filed',
        timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      },
      {
        complaint: comp2._id,
        previousStatus: 'new',
        newStatus: 'assigned',
        changedBy: hrAnita._id,
        changedByName: hrAnita.name,
        reasonOrNote: 'Assigned to estate plumbing & sanitation squad.',
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
      {
        complaint: comp2._id,
        previousStatus: 'assigned',
        newStatus: 'resolved',
        changedBy: hrRajesh._id,
        changedByName: hrRajesh.name,
        reasonOrNote: 'Filter cartridges replaced and tested for 0 TDS reading. Floor sanitized.',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ]);

    // Complaint 3: Under Review (Anonymous)
    const comp3 = await Complaint.create({
      ticketId: 'CV-2026-3402',
      title: 'Shortage of reserve reference textbooks for Advanced Algorithms & Machine Learning',
      category: 'Library issue',
      department: deptMap['LIB'],
      location: 'Central Library, Reference Section (Floor 1)',
      description:
        'Only 2 copies of Cormen (CLRS) 4th Edition and Bishop ML are available for a batch of 180 students. All copies are permanently checked out.',
      priority: 'low',
      isAnonymous: true,
      student: studentArjun._id,
      status: 'under_review',
    });

    await ComplaintStatusHistory.create({
      complaint: comp3._id,
      previousStatus: 'none',
      newStatus: 'new',
      changedBy: studentArjun._id,
      changedByName: 'Anonymous Student',
      reasonOrNote: 'Grievance submitted under anonymous privacy mode',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });

    // Complaint 4: New
    const comp4 = await Complaint.create({
      ticketId: 'CV-2026-4190',
      title: 'Delayed semester grade sheet re-verification dispatch',
      category: 'Administration issue',
      department: deptMap['SAW'],
      location: 'Examination Cell, Admin Block',
      description:
        'Applied for grade re-check 3 weeks ago via challan #CH-8821. No status update or verification acknowledgment received yet.',
      priority: 'medium',
      isAnonymous: false,
      student: studentAnanya._id,
      status: 'new',
    });

    console.log('[Seed] Seeding Announcements and System Settings...');
    await Announcement.insertMany([
      {
        title: 'Mid-Semester Feedback Windows Now Open - Complete by Nov 15',
        content:
          'All students across CSE, ECE, MECH, and MBA departments are requested to fill out the mid-semester faculty feedback forms. Your constructive evaluation shapes curriculum pacing and lab improvements.',
        category: 'Academic',
        priority: 'important',
        targetAudience: 'all',
        publishedBy: hrAnita._id,
        isActive: true,
      },
      {
        title: 'Central Library Extended Night Hours for End-Semester Examinations',
        content:
          'From next Monday, the Central Library Digital Reading Hall will remain open until 11:30 PM. High-speed charging hubs and silent zones have been provisioned.',
        category: 'Facilities',
        priority: 'normal',
        targetAudience: 'students',
        publishedBy: hrRajesh._id,
        isActive: true,
      },
    ]);

    await SystemSetting.insertMany([
      {
        key: 'collegeName',
        value: 'National Institute of Technology & Engineering',
        description: 'Official College Name',
        category: 'general',
      },
      {
        key: 'portalTitle',
        value: 'CampusVoice - Centralized Feedback & Grievance Portal',
        description: 'Portal Header and Title',
        category: 'general',
      },
      {
        key: 'supportEmail',
        value: 'grievance.cell@campusvoice.edu',
        description: 'Support contact email address',
        category: 'general',
      },
      {
        key: 'allowAnonymousComplaints',
        value: true,
        description: 'Permit students to file grievances anonymously',
        category: 'security',
      },
      {
        key: 'complaintSlaDays',
        value: 5,
        description: 'Target SLA in days for complaint resolution',
        category: 'complaint_sla',
      },
    ]);

    await AuditLog.insertMany([
      {
        userName: 'Dr. Vikram Sengupta',
        userEmail: 'admin@campusvoice.edu',
        userRole: 'super_admin',
        action: 'SYSTEM_INITIALIZED',
        module: 'settings',
        details: 'Initial system deployment and departmental configuration established',
        ipAddress: '127.0.0.1',
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
      {
        userName: 'Anita Deshmukh',
        userEmail: 'anita.deshmukh@campus.edu',
        userRole: 'hr_officer',
        action: 'PUBLISH_FORM',
        module: 'forms',
        details: 'Published form: Mid-Semester Faculty & Teaching Effectiveness Survey - Fall 2026',
        ipAddress: '127.0.0.1',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    ]);

    console.log('[Seed] Database seeding completed successfully!');
    console.log('--------------------------------------------------');
    console.log('Sample Accounts Created:');
    console.log('1. Super Admin : admin@campusvoice.edu     / Admin@2026');
    console.log('2. HR Officer  : anita.deshmukh@campus.edu  / Admin@2026');
    console.log('3. HR Officer  : rajesh.k@campus.edu       / Admin@2026');
    console.log('4. Student     : rahul.sharma@campus.edu    / Student@2026');
    console.log('5. Student     : priya.patel@campus.edu     / Student@2026');
    console.log('--------------------------------------------------');

    process.exit(0);
  } catch (err) {
    console.error('[Seed] Error seeding database:', err);
    process.exit(1);
  }
};

seedDB();
