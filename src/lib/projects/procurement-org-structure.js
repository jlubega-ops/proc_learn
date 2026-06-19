/**
 * Standard procurement governance hierarchy (same roles across learning projects).
 * Visual branding is applied per organisation in the chart component.
 */
export const PROCUREMENT_ORG_STRUCTURE = {
  apex: {
    id: "accounting-officer",
    title: "Accounting Officer",
    description: "Accountable authority for procurement governance",
  },
  branches: [
    {
      id: "head-pdu",
      title: "Head PDU",
      description: "Leads the Procurement and Disposal Unit",
      children: [
        { id: "procurement-officer", title: "Procurement Officer" },
        { id: "contracts-officer", title: "Contracts Officer" },
      ],
    },
    {
      id: "contracts-committee",
      title: "Contracts Committee",
      description: "Reviews and approves procurement decisions",
    },
    {
      id: "user-departments",
      title: "User Departments (Various Units)",
      description: "Initiating departments across the organisation",
      children: [
        {
          id: "head-user-department",
          title: "Head User Department",
          children: [{ id: "user-department-staff", title: "User Department Staff" }],
        },
      ],
    },
  ],
};
