const Department = require('../models/Department');
const { recordAuditLog } = require('../middleware/audit');

const getDepartments = async (req, res, next) => {
  try {
    const departments = await Department.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, count: departments.length, departments });
  } catch (error) {
    next(error);
  }
};

const createDepartment = async (req, res, next) => {
  try {
    const { name, code, type, headOfDepartment, contactEmail, phone } = req.body;
    const department = await Department.create({
      name,
      code,
      type: type || 'academic',
      headOfDepartment,
      contactEmail,
      phone,
    });

    await recordAuditLog({
      user: req.user,
      action: 'CREATE_DEPARTMENT',
      module: 'departments',
      details: `Created department: ${department.name} (${department.code})`,
      req,
    });

    res.status(201).json({ success: true, department });
  } catch (error) {
    next(error);
  }
};

const updateDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const department = await Department.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    await recordAuditLog({
      user: req.user,
      action: 'UPDATE_DEPARTMENT',
      module: 'departments',
      details: `Updated department: ${department.name}`,
      req,
    });

    res.json({ success: true, department });
  } catch (error) {
    next(error);
  }
};

const deleteDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const department = await Department.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    await recordAuditLog({
      user: req.user,
      action: 'DEACTIVATE_DEPARTMENT',
      module: 'departments',
      details: `Deactivated department: ${department.name}`,
      req,
    });

    res.json({ success: true, message: 'Department deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
