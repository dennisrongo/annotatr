use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shape {
    pub id: String,
    pub tool: String,
    pub monitor_id: String,
    pub x: i32,
    pub y: i32,
    pub data: serde_json::Value,
}

pub struct OverlayManager {
    shapes: HashMap<String, Shape>,
}

impl OverlayManager {
    pub fn new() -> Self {
        Self {
            shapes: HashMap::new(),
        }
    }

    pub fn add_shape(&mut self, shape: Shape) {
        self.shapes.insert(shape.id.clone(), shape);
    }

    pub fn remove_shape(&mut self, shape_id: &str) {
        self.shapes.remove(shape_id);
    }

    pub fn clear_all(&mut self) {
        self.shapes.clear();
    }

    pub fn get_shapes_for_monitor(&self, monitor_id: &str) -> Vec<Shape> {
        self.shapes
            .values()
            .filter(|shape| shape.monitor_id == monitor_id)
            .cloned()
            .collect()
    }
}

impl Default for OverlayManager {
    fn default() -> Self {
        Self::new()
    }
}
